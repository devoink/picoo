use image::DynamicImage;
use imagequant::{Attributes, RGBA};

use crate::dpi;
use crate::error::PicooError;

/// Encode PNG with palette quantization. `quality` 1–100 controls min/target quantizer quality.
pub fn encode_png_quantized(img: &DynamicImage, quality: u8, dpi: Option<u32>) -> Result<Vec<u8>, PicooError> {
    let rgba = img.to_rgba8();
    let width = rgba.width() as usize;
    let height = rgba.height() as usize;
    if width == 0 || height == 0 {
        return Err(PicooError::InvalidInput("empty image".into()));
    }

    let pixels: Vec<RGBA> = rgba
        .chunks_exact(4)
        .map(|p| RGBA::new(p[0], p[1], p[2], p[3]))
        .collect();

    let min_q = quality.saturating_sub(40);
    let mut liq = Attributes::new();
    liq.set_quality(min_q, quality)
        .map_err(|e| PicooError::ProcessFailed(e.to_string()))?;
    liq.set_speed(5)
        .map_err(|e| PicooError::ProcessFailed(e.to_string()))?;

    let mut image = liq
        .new_image(pixels, width, height, 0.0)
        .map_err(|e| PicooError::ProcessFailed(e.to_string()))?;
    let mut result = liq
        .quantize(&mut image)
        .map_err(|e| PicooError::ProcessFailed(e.to_string()))?;
    let (palette, indices) = result
        .remapped(&mut image)
        .map_err(|e| PicooError::ProcessFailed(e.to_string()))?;

    let mut pal_rgb = Vec::with_capacity(palette.len() * 3);
    let mut trns = Vec::with_capacity(palette.len());
    for entry in &palette {
        pal_rgb.extend_from_slice(&[entry.r, entry.g, entry.b]);
        trns.push(entry.a);
    }
    let has_alpha = trns.iter().any(|a| *a < 255);

    let mut buf = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut buf, width as u32, height as u32);
        encoder.set_color(png::ColorType::Indexed);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_compression(png::Compression::Best);
        encoder.set_palette(&pal_rgb);
        if has_alpha {
            encoder.set_trns(&trns);
        }

        let mut writer = encoder
            .write_header()
            .map_err(|e| PicooError::ProcessFailed(e.to_string()))?;
        writer
            .write_image_data(&indices)
            .map_err(|e| PicooError::ProcessFailed(e.to_string()))?;
    }

    if let Some(d) = dpi {
        buf = dpi::set_png_dpi(&buf, d)?;
    }

    Ok(buf)
}
