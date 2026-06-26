use fast_image_resize::images::Image;
use fast_image_resize::{FilterType, PixelType, ResizeAlg, ResizeOptions, Resizer};
use image::{DynamicImage, Rgba, RgbaImage};

use crate::error::PicooError;
use crate::options::{ProcessOptions, ResizeMode};

pub fn apply(img: DynamicImage, opts: &ProcessOptions) -> Result<DynamicImage, PicooError> {
    if opts.width.is_none() && opts.height.is_none() {
        return Ok(img);
    }

    let mode = opts.mode.unwrap_or(ResizeMode::Inside);
    let target_w = opts.width.unwrap_or(0);
    let target_h = opts.height.unwrap_or(0);

    match mode {
        ResizeMode::Cover => apply_cover(img, target_w, target_h),
        ResizeMode::Contain => apply_contain(img, target_w, target_h, opts),
        ResizeMode::Fill => apply_fill(img, target_w, target_h),
        ResizeMode::Inside | ResizeMode::Outside => {
            let (tw, th) = compute_fit_size(img.width(), img.height(), target_w, target_h, mode);
            if tw == img.width() && th == img.height() {
                return Ok(img);
            }
            resize_rgba(&img.to_rgba8(), img.width(), img.height(), tw, th)
                .map(DynamicImage::ImageRgba8)
        }
    }
}

fn compute_fit_size(
    src_w: u32,
    src_h: u32,
    target_w: u32,
    target_h: u32,
    mode: ResizeMode,
) -> (u32, u32) {
    let tw = if target_w > 0 { target_w } else { src_w };
    let th = if target_h > 0 { target_h } else { src_h };

    if target_w == 0 {
        let scale = th as f64 / src_h as f64;
        return (((src_w as f64 * scale).round() as u32).max(1), th);
    }
    if target_h == 0 {
        let scale = tw as f64 / src_w as f64;
        return (tw, ((src_h as f64 * scale).round() as u32).max(1));
    }

    let scale_w = tw as f64 / src_w as f64;
    let scale_h = th as f64 / src_h as f64;
    let scale = match mode {
        ResizeMode::Outside => scale_w.max(scale_h),
        _ => scale_w.min(scale_h),
    };
    (
        (src_w as f64 * scale).round().max(1.0) as u32,
        (src_h as f64 * scale).round().max(1.0) as u32,
    )
}

fn apply_cover(
    img: DynamicImage,
    target_w: u32,
    target_h: u32,
) -> Result<DynamicImage, PicooError> {
    let tw = if target_w > 0 { target_w } else { img.width() };
    let th = if target_h > 0 { target_h } else { img.height() };
    let src_w = img.width();
    let src_h = img.height();

    let scale = (tw as f64 / src_w as f64).max(th as f64 / src_h as f64);
    let crop_w = (tw as f64 / scale).round() as u32;
    let crop_h = (th as f64 / scale).round() as u32;
    let x = (src_w.saturating_sub(crop_w)) / 2;
    let y = (src_h.saturating_sub(crop_h)) / 2;

    let cropped = img.crop_imm(x, y, crop_w.min(src_w - x), crop_h.min(src_h - y));
    resize_rgba(
        &cropped.to_rgba8(),
        cropped.width(),
        cropped.height(),
        tw,
        th,
    )
    .map(DynamicImage::ImageRgba8)
}

fn apply_contain(
    img: DynamicImage,
    target_w: u32,
    target_h: u32,
    opts: &ProcessOptions,
) -> Result<DynamicImage, PicooError> {
    let (tw, th) = compute_fit_size(
        img.width(),
        img.height(),
        target_w,
        target_h,
        ResizeMode::Inside,
    );
    let resized = resize_rgba(&img.to_rgba8(), img.width(), img.height(), tw, th)?;

    let canvas_w = if target_w > 0 { target_w } else { tw };
    let canvas_h = if target_h > 0 { target_h } else { th };
    if canvas_w == tw && canvas_h == th {
        return Ok(DynamicImage::ImageRgba8(resized));
    }

    let bg = parse_background(opts.background.as_deref());
    let mut canvas = RgbaImage::from_pixel(canvas_w, canvas_h, bg);
    let ox = (canvas_w.saturating_sub(tw)) / 2;
    let oy = (canvas_h.saturating_sub(th)) / 2;
    image::imageops::overlay(&mut canvas, &resized, ox.into(), oy.into());
    Ok(DynamicImage::ImageRgba8(canvas))
}

fn apply_fill(img: DynamicImage, target_w: u32, target_h: u32) -> Result<DynamicImage, PicooError> {
    let tw = if target_w > 0 { target_w } else { img.width() };
    let th = if target_h > 0 { target_h } else { img.height() };
    resize_rgba(&img.to_rgba8(), img.width(), img.height(), tw, th).map(DynamicImage::ImageRgba8)
}

fn parse_background(s: Option<&str>) -> Rgba<u8> {
    let s = s.unwrap_or("#ffffff");
    if s.starts_with('#') && s.len() >= 7 {
        let r = u8::from_str_radix(&s[1..3], 16).unwrap_or(255);
        let g = u8::from_str_radix(&s[3..5], 16).unwrap_or(255);
        let b = u8::from_str_radix(&s[5..7], 16).unwrap_or(255);
        return Rgba([r, g, b, 255]);
    }
    Rgba([255, 255, 255, 255])
}

fn resize_rgba(
    src: &RgbaImage,
    src_w: u32,
    src_h: u32,
    dst_w: u32,
    dst_h: u32,
) -> Result<RgbaImage, PicooError> {
    if dst_w == 0 || dst_h == 0 {
        return Err(PicooError::InvalidInput(
            "target dimensions must be > 0".into(),
        ));
    }

    let src_image = Image::from_vec_u8(src_w, src_h, src.as_raw().clone(), PixelType::U8x4)
        .map_err(|e| PicooError::ProcessFailed(e.to_string()))?;

    let mut dst_image = Image::new(dst_w, dst_h, PixelType::U8x4);
    let mut resizer = Resizer::new();
    let options = ResizeOptions::new().resize_alg(ResizeAlg::Convolution(FilterType::Lanczos3));
    resizer
        .resize(&src_image, &mut dst_image, Some(&options))
        .map_err(|e| PicooError::ProcessFailed(e.to_string()))?;

    RgbaImage::from_raw(dst_w, dst_h, dst_image.into_vec())
        .ok_or_else(|| PicooError::ProcessFailed("failed to build output image".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::RgbaImage;

    #[test]
    fn inside_scales_down() {
        let img = DynamicImage::ImageRgba8(RgbaImage::new(800, 600));
        let opts = ProcessOptions {
            width: Some(400),
            height: Some(300),
            mode: Some(ResizeMode::Inside),
            ..Default::default()
        };
        let out = apply(img, &opts).unwrap();
        assert_eq!(out.width(), 400);
        assert_eq!(out.height(), 300);
    }
}
