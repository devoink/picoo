use image::ImageFormat;
use serde::Serialize;

use crate::decode::{detect_format, format_to_mime, format_to_str};
use crate::error::PicooError;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageInfo {
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub mime_type: String,
    pub size: usize,
    pub has_alpha: bool,
    pub bit_depth: Option<u8>,
    pub dpi: Option<u32>,
    pub orientation: Option<u8>,
}

pub fn get_info(input: &[u8]) -> Result<ImageInfo, PicooError> {
    let fmt = detect_format(input)?;
    let size = input.len();
    let (width, height, has_alpha, bit_depth) = read_dimensions(input, fmt)?;

    Ok(ImageInfo {
        width,
        height,
        format: format_to_str(fmt).to_string(),
        mime_type: format_to_mime(fmt).to_string(),
        size,
        has_alpha,
        bit_depth,
        dpi: read_jpeg_dpi(input, fmt).or_else(|| read_png_dpi(input, fmt)),
        orientation: None,
    })
}

fn read_dimensions(
    input: &[u8],
    fmt: ImageFormat,
) -> Result<(u32, u32, bool, Option<u8>), PicooError> {
    match fmt {
        ImageFormat::Png => read_png_header(input),
        ImageFormat::Jpeg => read_jpeg_sof(input),
        ImageFormat::WebP => read_webp_header(input),
        _ => {
            let img = image::load_from_memory(input)
                .map_err(|e| PicooError::InvalidInput(e.to_string()))?;
            Ok((img.width(), img.height(), img.color().has_alpha(), Some(8)))
        }
    }
}

fn read_png_header(input: &[u8]) -> Result<(u32, u32, bool, Option<u8>), PicooError> {
    if input.len() < 26 {
        return Err(PicooError::InvalidInput("PNG too short".into()));
    }
    let width = u32::from_be_bytes(input[16..20].try_into().unwrap());
    let height = u32::from_be_bytes(input[20..24].try_into().unwrap());
    let color_type = input[25];
    let has_alpha = matches!(color_type, 4 | 6);
    let bit_depth = Some(input[24]);
    Ok((width, height, has_alpha, bit_depth))
}

fn read_jpeg_sof(input: &[u8]) -> Result<(u32, u32, bool, Option<u8>), PicooError> {
    let mut i = 2usize;
    while i + 9 < input.len() {
        if input[i] != 0xFF {
            i += 1;
            continue;
        }
        let marker = input[i + 1];
        if marker == 0xD8 {
            i += 2;
            continue;
        }
        if (0xC0..=0xCF).contains(&marker) && marker != 0xC4 && marker != 0xC8 && marker != 0xCC {
            let height = u16::from_be_bytes([input[i + 5], input[i + 6]]) as u32;
            let width = u16::from_be_bytes([input[i + 7], input[i + 8]]) as u32;
            return Ok((width, height, false, Some(8)));
        }
        if i + 3 >= input.len() {
            break;
        }
        let len = u16::from_be_bytes([input[i + 2], input[i + 3]]) as usize;
        i += 2 + len;
    }
    Err(PicooError::InvalidInput("JPEG SOF not found".into()))
}

fn read_webp_header(input: &[u8]) -> Result<(u32, u32, bool, Option<u8>), PicooError> {
    if input.len() < 30 || &input[0..4] != b"RIFF" || &input[8..12] != b"WEBP" {
        return Err(PicooError::InvalidInput("invalid WebP".into()));
    }
    let mut pos = 12usize;
    while pos + 8 <= input.len() {
        let tag = &input[pos..pos + 4];
        let len = u32::from_le_bytes(input[pos + 4..pos + 8].try_into().unwrap()) as usize;
        if tag == b"VP8X" && pos + 8 + len >= 14 {
            let w = 1 + u32::from_le_bytes([input[pos + 12], input[pos + 13], input[pos + 14], 0]);
            let h = 1 + u32::from_le_bytes([input[pos + 15], input[pos + 16], input[pos + 17], 0]);
            let flags = input[pos + 8];
            let has_alpha = flags & 0x10 != 0;
            return Ok((w, h, has_alpha, Some(8)));
        }
        if tag == b"VP8 " && len >= 10 {
            let w = u16::from_le_bytes([input[pos + 14], input[pos + 15]]) as u32 & 0x3FFF;
            let h = u16::from_le_bytes([input[pos + 16], input[pos + 17]]) as u32 & 0x3FFF;
            return Ok((w, h, false, Some(8)));
        }
        pos += 8 + len + (len & 1);
    }
    Err(PicooError::InvalidInput("WebP header not found".into()))
}

fn read_jpeg_dpi(input: &[u8], fmt: ImageFormat) -> Option<u32> {
    if fmt != ImageFormat::Jpeg {
        return None;
    }
    let mut i = 2usize;
    while i + 16 < input.len() {
        if input[i] == 0xFF && input[i + 1] == 0xE0 {
            let density_x = u16::from_be_bytes([input[i + 11], input[i + 12]]);
            let units = input[i + 14];
            if units == 1 && density_x > 0 {
                return Some(density_x as u32);
            }
        }
        if input[i] != 0xFF {
            i += 1;
            continue;
        }
        if i + 3 >= input.len() {
            break;
        }
        let len = u16::from_be_bytes([input[i + 2], input[i + 3]]) as usize;
        i += 2 + len;
    }
    None
}

fn read_png_dpi(input: &[u8], fmt: ImageFormat) -> Option<u32> {
    if fmt != ImageFormat::Png {
        return None;
    }
    let mut pos = 8usize;
    while pos + 12 <= input.len() {
        let len = u32::from_be_bytes(input[pos..pos + 4].try_into().ok()?) as usize;
        if &input[pos + 4..pos + 8] == b"pHYs" && len >= 9 {
            let ppm = u32::from_be_bytes(input[pos + 8..pos + 12].try_into().ok()?);
            if input[pos + 16] == 1 && ppm > 0 {
                return Some((ppm as f64 * 0.0254).round() as u32);
            }
        }
        pos += 12 + len;
    }
    None
}
