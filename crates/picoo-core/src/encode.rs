use image::codecs::jpeg::JpegEncoder;
use image::codecs::jpeg::PixelDensity;
use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::{DynamicImage, ExtendedColorType, ImageEncoder};
use zenwebp::{EncodeRequest, LosslessConfig, LossyConfig, PixelLayout};

use crate::decode::{output_format_mime, output_format_str, resolve_output_format};
use crate::dpi;
use crate::error::PicooError;
use crate::options::{OutputFormat, ProcessOptions};
use crate::png_quant;

pub struct EncodeResult {
    pub data: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub format: OutputFormat,
    pub quality: Option<u8>,
}

pub fn encode(
    mut img: DynamicImage,
    input: &[u8],
    opts: &ProcessOptions,
) -> Result<EncodeResult, PicooError> {
    let format = resolve_output_format(input, opts);
    let (data, quality) = if opts.max_size_kb.is_some() {
        encode_with_target_size(&mut img, format, opts)?
    } else {
        let q = opts.format_quality(format);
        match format {
            OutputFormat::Png if q >= 100 => (encode_png_lossless(&img, opts.dpi)?, Some(q)),
            OutputFormat::Webp if opts.webp_lossless() => {
                (encode_webp_lossless(&img, opts.dpi)?, None)
            }
            _ => (encode_once(&img, format, q, opts)?, Some(q)),
        }
    };

    Ok(EncodeResult {
        width: img.width(),
        height: img.height(),
        format,
        data,
        quality,
    })
}

fn encode_with_target_size(
    img: &mut DynamicImage,
    format: OutputFormat,
    opts: &ProcessOptions,
) -> Result<(Vec<u8>, Option<u8>), PicooError> {
    let target_bytes = (opts.max_size_kb.unwrap() * 1024.0) as usize;
    let tolerance = opts.tolerance();
    let min_q = opts.min_quality();
    let max_q = opts.max_quality();

    if matches!(format, OutputFormat::Webp) && opts.webp_lossless() {
        return encode_lossless_target_size(img, format, opts, target_bytes, tolerance);
    }

    let mut outer_pass = 0u32;
    loop {
        outer_pass += 1;
        if outer_pass > 40 {
            return Err(PicooError::TargetSizeUnreachable);
        }

        let mut lo = min_q;
        let mut hi = max_q;
        let mut best: Option<(Vec<u8>, u8)> = None;

        while lo <= hi {
            let mid = (lo + hi) / 2;
            let data = encode_once(img, format, mid, opts)?;
            if data.len() <= target_bytes {
                best = Some((data, mid));
                lo = mid + 1;
            } else if mid == 0 {
                break;
            } else {
                hi = mid - 1;
            }
        }

        let upper = (target_bytes as f64 * (1.0 + tolerance)) as usize;
        match best {
            Some((data, q)) if data.len() <= upper || !opts.auto_resize() => {
                return Ok((data, Some(q)));
            }
            None if !opts.auto_resize() => return Err(PicooError::TargetSizeUnreachable),
            Some((data, q)) => {
                if shrink_image(img, opts)? {
                    continue;
                }
                return Ok((data, Some(q)));
            }
            None => {
                if shrink_image(img, opts)? {
                    continue;
                }
                return Err(PicooError::TargetSizeUnreachable);
            }
        }
    }
}

fn encode_lossless_target_size(
    img: &mut DynamicImage,
    format: OutputFormat,
    opts: &ProcessOptions,
    target_bytes: usize,
    tolerance: f64,
) -> Result<(Vec<u8>, Option<u8>), PicooError> {
    for pass in 1..=40 {
        let data = encode_once(img, format, 100, opts)?;
        let upper = (target_bytes as f64 * (1.0 + tolerance)) as usize;
        if data.len() <= upper || !opts.auto_resize() {
            return Ok((data, None));
        }
        if !shrink_image(img, opts)? {
            return Ok((data, None));
        }
        if pass == 40 {
            return Err(PicooError::TargetSizeUnreachable);
        }
    }
    Err(PicooError::TargetSizeUnreachable)
}

fn shrink_image(img: &mut DynamicImage, opts: &ProcessOptions) -> Result<bool, PicooError> {
    let (w, h) = (img.width(), img.height());
    if w <= opts.min_width() && h <= opts.min_height() {
        return Ok(false);
    }
    let nw = ((w as f64 * 0.9).round() as u32)
        .max(opts.min_width())
        .min(w);
    let nh = ((h as f64 * 0.9).round() as u32)
        .max(opts.min_height())
        .min(h);
    if nw == w && nh == h {
        return Ok(false);
    }
    *img = image::imageops::resize(img, nw, nh, image::imageops::FilterType::Triangle).into();
    Ok(true)
}

fn encode_once(
    img: &DynamicImage,
    format: OutputFormat,
    quality: u8,
    opts: &ProcessOptions,
) -> Result<Vec<u8>, PicooError> {
    match format {
        OutputFormat::Jpeg => encode_jpeg(img, quality, opts.dpi),
        OutputFormat::Png => {
            if quality >= 100 {
                encode_png_lossless(img, opts.dpi)
            } else {
                png_quant::encode_png_quantized(img, quality, opts.dpi)
            }
        }
        OutputFormat::Webp => {
            if opts.webp_lossless() {
                encode_webp_lossless(img, opts.dpi)
            } else {
                encode_webp_lossy(img, quality, opts.dpi)
            }
        }
    }
}

fn encode_jpeg(img: &DynamicImage, quality: u8, dpi: Option<u32>) -> Result<Vec<u8>, PicooError> {
    let mut buf = Vec::new();
    let rgb = img.to_rgb8();
    let mut enc = JpegEncoder::new_with_quality(&mut buf, quality);
    if let Some(d) = dpi {
        enc.set_pixel_density(PixelDensity::dpi(d as u16));
    }
    enc.write_image(
        rgb.as_raw(),
        rgb.width(),
        rgb.height(),
        ExtendedColorType::Rgb8,
    )
    .map_err(|e| PicooError::ProcessFailed(e.to_string()))?;
    Ok(buf)
}

fn encode_png_lossless(img: &DynamicImage, dpi: Option<u32>) -> Result<Vec<u8>, PicooError> {
    let mut buf = Vec::new();
    let rgba = img.to_rgba8();
    let enc = PngEncoder::new_with_quality(&mut buf, CompressionType::Best, FilterType::Adaptive);
    enc.write_image(
        rgba.as_raw(),
        rgba.width(),
        rgba.height(),
        ExtendedColorType::Rgba8,
    )
    .map_err(|e| PicooError::ProcessFailed(e.to_string()))?;
    if let Some(d) = dpi {
        buf = dpi::set_png_dpi(&buf, d)?;
    }
    Ok(buf)
}

fn encode_webp_lossy(
    img: &DynamicImage,
    quality: u8,
    dpi: Option<u32>,
) -> Result<Vec<u8>, PicooError> {
    let config = LossyConfig::new().with_quality(f32::from(quality));
    let mut buf = if img.color().has_alpha() {
        let rgba = img.to_rgba8();
        EncodeRequest::lossy(
            &config,
            rgba.as_raw(),
            PixelLayout::Rgba8,
            rgba.width(),
            rgba.height(),
        )
        .encode()
        .map_err(|e| PicooError::ProcessFailed(e.to_string()))?
    } else {
        let rgb = img.to_rgb8();
        EncodeRequest::lossy(
            &config,
            rgb.as_raw(),
            PixelLayout::Rgb8,
            rgb.width(),
            rgb.height(),
        )
        .encode()
        .map_err(|e| PicooError::ProcessFailed(e.to_string()))?
    };
    if let Some(d) = dpi {
        buf = dpi::set_webp_dpi_placeholder(buf, d);
    }
    Ok(buf)
}

fn encode_webp_lossless(img: &DynamicImage, dpi: Option<u32>) -> Result<Vec<u8>, PicooError> {
    let config = LosslessConfig::new();
    let mut buf = if img.color().has_alpha() {
        let rgba = img.to_rgba8();
        EncodeRequest::lossless(
            &config,
            rgba.as_raw(),
            PixelLayout::Rgba8,
            rgba.width(),
            rgba.height(),
        )
        .encode()
        .map_err(|e| PicooError::ProcessFailed(e.to_string()))?
    } else {
        let rgb = img.to_rgb8();
        EncodeRequest::lossless(
            &config,
            rgb.as_raw(),
            PixelLayout::Rgb8,
            rgb.width(),
            rgb.height(),
        )
        .encode()
        .map_err(|e| PicooError::ProcessFailed(e.to_string()))?
    };
    if let Some(d) = dpi {
        buf = dpi::set_webp_dpi_placeholder(buf, d);
    }
    Ok(buf)
}

pub fn encode_result_meta(result: &EncodeResult) -> (String, String) {
    (
        output_format_str(result.format).to_string(),
        output_format_mime(result.format).to_string(),
    )
}
