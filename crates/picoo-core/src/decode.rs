use image::DynamicImage;
use image::ImageFormat;

use crate::error::PicooError;
use crate::options::OutputFormat;

pub fn decode(input: &[u8]) -> Result<DynamicImage, PicooError> {
    image::load_from_memory(input).map_err(|e| PicooError::InvalidInput(e.to_string()))
}

pub fn detect_format(input: &[u8]) -> Result<ImageFormat, PicooError> {
    image::guess_format(input).map_err(|e| PicooError::InvalidInput(e.to_string()))
}

pub fn format_to_str(fmt: ImageFormat) -> &'static str {
    match fmt {
        ImageFormat::Jpeg => "jpeg",
        ImageFormat::Png => "png",
        ImageFormat::WebP => "webp",
        ImageFormat::Gif => "gif",
        ImageFormat::Bmp => "bmp",
        _ => "unknown",
    }
}

pub fn format_to_mime(fmt: ImageFormat) -> &'static str {
    match fmt {
        ImageFormat::Jpeg => "image/jpeg",
        ImageFormat::Png => "image/png",
        ImageFormat::WebP => "image/webp",
        ImageFormat::Gif => "image/gif",
        ImageFormat::Bmp => "image/bmp",
        _ => "application/octet-stream",
    }
}

pub fn output_format_str(fmt: OutputFormat) -> &'static str {
    match fmt {
        OutputFormat::Jpeg => "jpeg",
        OutputFormat::Png => "png",
        OutputFormat::Webp => "webp",
    }
}

pub fn output_format_mime(fmt: OutputFormat) -> &'static str {
    match fmt {
        OutputFormat::Jpeg => "image/jpeg",
        OutputFormat::Png => "image/png",
        OutputFormat::Webp => "image/webp",
    }
}

pub fn resolve_output_format(input: &[u8], opts: &crate::options::ProcessOptions) -> OutputFormat {
    if let Some(fmt) = opts.format {
        return fmt;
    }
    match detect_format(input) {
        Ok(ImageFormat::Png) => OutputFormat::Png,
        Ok(ImageFormat::WebP) => OutputFormat::Webp,
        Ok(ImageFormat::Jpeg) => OutputFormat::Jpeg,
        _ => OutputFormat::Jpeg,
    }
}
