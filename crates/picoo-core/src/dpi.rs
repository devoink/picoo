use crate::error::PicooError;

/// Insert or replace PNG pHYs chunk for DPI metadata.
pub fn set_png_dpi(data: &[u8], dpi: u32) -> Result<Vec<u8>, PicooError> {
    let ppm = (dpi as f64 / 0.0254).round() as u32;

    if data.len() < 8 || data[0..8] != [137, 80, 78, 71, 13, 10, 26, 10] {
        return Err(PicooError::ProcessFailed("invalid PNG".into()));
    }

    let mut out = Vec::new();
    out.extend_from_slice(&data[0..8]);
    out.extend_from_slice(&build_phys_chunk(ppm));

    let mut pos = 8usize;
    while pos + 12 <= data.len() {
        let len = u32::from_be_bytes(data[pos..pos + 4].try_into().unwrap()) as usize;
        let chunk_type = &data[pos + 4..pos + 8];
        let chunk_end = pos + 12 + len;
        if chunk_end > data.len() {
            break;
        }
        if chunk_type != b"pHYs" {
            out.extend_from_slice(&data[pos..chunk_end]);
        }
        pos = chunk_end;
    }

    if pos < data.len() {
        out.extend_from_slice(&data[pos..]);
    }

    Ok(out)
}

fn build_phys_chunk(pixels_per_meter: u32) -> Vec<u8> {
    let mut chunk = Vec::new();
    chunk.extend_from_slice(&9u32.to_be_bytes());
    chunk.extend_from_slice(b"pHYs");
    chunk.extend_from_slice(&pixels_per_meter.to_be_bytes());
    chunk.extend_from_slice(&pixels_per_meter.to_be_bytes());
    chunk.push(1);

    let crc = crc32(&chunk[4..]);
    chunk.extend_from_slice(&crc.to_be_bytes());
    chunk
}

fn crc32(data: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for byte in data {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            if crc & 1 != 0 {
                crc = (crc >> 1) ^ 0xEDB8_8320;
            } else {
                crc >>= 1;
            }
        }
    }
    !crc
}

/// WebP EXIF embedding is complex; pass-through for now.
pub fn set_webp_dpi_placeholder(data: Vec<u8>, _dpi: u32) -> Vec<u8> {
    data
}
