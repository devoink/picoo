mod crop;
mod decode;
mod dpi;
mod encode;
mod error;
mod info;
mod options;
mod png_quant;
mod resize;

use serde::Serialize;
use wasm_bindgen::prelude::*;

use crate::error::PicooError;
use crate::options::ProcessOptions;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProcessResultJson {
    width: u32,
    height: u32,
    format: String,
    mime_type: String,
    size: usize,
    quality: Option<u8>,
}

#[wasm_bindgen]
pub struct ProcessOutput {
    data: Vec<u8>,
    meta_json: String,
}

#[wasm_bindgen]
impl ProcessOutput {
    #[wasm_bindgen(getter)]
    pub fn data(&self) -> Vec<u8> {
        self.data.clone()
    }

    #[wasm_bindgen(getter, js_name = metaJson)]
    pub fn meta_json(&self) -> String {
        self.meta_json.clone()
    }
}

fn to_js_error(err: PicooError) -> JsValue {
    let obj = js_sys::Object::new();
    let _ = js_sys::Reflect::set(
        &obj,
        &JsValue::from_str("code"),
        &JsValue::from_str(err.code()),
    );
    let _ = js_sys::Reflect::set(
        &obj,
        &JsValue::from_str("message"),
        &JsValue::from_str(&err.to_string()),
    );
    JsValue::from(obj)
}

pub fn run_pipeline(
    input: &[u8],
    opts: &ProcessOptions,
) -> Result<encode::EncodeResult, PicooError> {
    let img = decode::decode(input)?;
    let img = crop::apply(img, &opts.crop)?;
    let img = resize::apply(img, opts)?;
    encode::encode(img, input, opts)
}

#[wasm_bindgen]
pub fn get_image_info(input: &[u8]) -> Result<String, JsValue> {
    info::get_info(input)
        .map(|i| serde_json::to_string(&i).unwrap_or_default())
        .map_err(to_js_error)
}

#[wasm_bindgen]
pub fn process_image(input: &[u8], opts_json: &str) -> Result<ProcessOutput, JsValue> {
    let opts: ProcessOptions = serde_json::from_str(opts_json)
        .map_err(|e| to_js_error(PicooError::InvalidInput(e.to_string())))?;

    let result = run_pipeline(input, &opts).map_err(to_js_error)?;
    let (format, mime_type) = encode::encode_result_meta(&result);

    let meta = ProcessResultJson {
        width: result.width,
        height: result.height,
        format,
        mime_type,
        size: result.data.len(),
        quality: result.quality,
    };

    Ok(ProcessOutput {
        data: result.data,
        meta_json: serde_json::to_string(&meta).unwrap_or_default(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgba};

    fn test_png() -> Vec<u8> {
        let img: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::from_fn(32, 32, |x, y| {
            Rgba([(x * 8) as u8, (y * 8) as u8, 128, 255])
        });
        let mut buf = Vec::new();
        img.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
            .unwrap();
        buf
    }

    fn test_png_large() -> Vec<u8> {
        let img: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::from_fn(512, 512, |x, y| {
            Rgba([(x / 2) as u8, (y / 2) as u8, ((x + y) / 4) as u8, 255])
        });
        let mut buf = Vec::new();
        img.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
            .unwrap();
        buf
    }

    #[test]
    fn pipeline_resize_jpeg() {
        let input = test_png();
        let opts = ProcessOptions {
            width: Some(16),
            height: Some(16),
            format: Some(crate::options::OutputFormat::Jpeg),
            quality: Some(80),
            ..Default::default()
        };
        let out = run_pipeline(&input, &opts).unwrap();
        assert_eq!(out.width, 16);
        assert!(out.data.len() > 100);
    }

    #[test]
    fn deserializes_max_size_kb_alias() {
        let opts: ProcessOptions =
            serde_json::from_str(r#"{"maxSizeKB":20,"width":500,"format":"jpeg","quality":80}"#)
                .unwrap();
        assert_eq!(opts.max_size_kb, Some(20.0));
    }

    #[test]
    fn max_size_kb_compresses_jpeg() {
        let input = test_png();
        let opts = ProcessOptions {
            width: Some(500),
            height: Some(500),
            format: Some(crate::options::OutputFormat::Jpeg),
            max_size_kb: Some(20.0),
            ..Default::default()
        };
        let out = run_pipeline(&input, &opts).unwrap();
        let upper = (20.0 * 1024.0 * 1.05) as usize;
        assert!(
            out.data.len() <= upper,
            "expected <= {} bytes, got {}",
            upper,
            out.data.len()
        );
    }

    #[test]
    fn png_quality_changes_output() {
        let input = test_png_large();
        let lossless = run_pipeline(
            &input,
            &ProcessOptions {
                format: Some(crate::options::OutputFormat::Png),
                quality: Some(100),
                ..Default::default()
            },
        )
        .unwrap();
        let quantized = run_pipeline(
            &input,
            &ProcessOptions {
                format: Some(crate::options::OutputFormat::Png),
                quality: Some(50),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(quantized.quality, Some(50));
        assert_ne!(lossless.data, quantized.data);
    }

    #[test]
    fn webp_lossless_and_lossy() {
        let input = test_png_large();
        let lossless = run_pipeline(
            &input,
            &ProcessOptions {
                format: Some(crate::options::OutputFormat::Webp),
                lossless: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        let lossy = run_pipeline(
            &input,
            &ProcessOptions {
                format: Some(crate::options::OutputFormat::Webp),
                quality: Some(75),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(lossless.quality, None);
        assert_eq!(lossy.quality, Some(75));
        assert_ne!(lossless.data, lossy.data);
    }

    #[test]
    fn info_reads_png() {
        let input = test_png();
        let info = info::get_info(&input).unwrap();
        assert_eq!(info.width, 32);
        assert_eq!(info.format, "png");
    }
}
