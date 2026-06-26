use serde::Deserialize;

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CropOptions {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Copy, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ResizeMode {
    #[default]
    Inside,
    Outside,
    Cover,
    Contain,
    Fill,
}

#[derive(Debug, Clone, Copy, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum OutputFormat {
    #[default]
    Jpeg,
    Png,
    Webp,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProcessOptions {
    pub crop: Option<CropOptions>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub mode: Option<ResizeMode>,
    pub format: Option<OutputFormat>,
    pub quality: Option<u8>,
    #[serde(alias = "maxSizeKB")]
    pub max_size_kb: Option<f64>,
    pub lossless: Option<bool>,
    pub dpi: Option<u32>,
    pub min_quality: Option<u8>,
    pub max_quality: Option<u8>,
    pub target_size_tolerance: Option<f64>,
    pub auto_resize: Option<bool>,
    pub min_width: Option<u32>,
    pub min_height: Option<u32>,
    pub background: Option<String>,
}

impl ProcessOptions {
    pub fn webp_lossless(&self) -> bool {
        self.lossless.unwrap_or(false)
    }

    pub fn min_quality(&self) -> u8 {
        if self.max_size_kb.is_some() {
            self.min_quality.unwrap_or(5)
        } else {
            self.min_quality.unwrap_or(40)
        }
    }

    pub fn max_quality(&self) -> u8 {
        self.max_quality.unwrap_or(95)
    }

    pub fn tolerance(&self) -> f64 {
        self.target_size_tolerance.unwrap_or(0.05)
    }

    pub fn auto_resize(&self) -> bool {
        self.auto_resize.unwrap_or(true)
    }

    pub fn min_width(&self) -> u32 {
        if self.max_size_kb.is_some() {
            self.min_width.unwrap_or(64)
        } else {
            self.min_width.unwrap_or(320)
        }
    }

    pub fn min_height(&self) -> u32 {
        if self.max_size_kb.is_some() {
            self.min_height.unwrap_or(64)
        } else {
            self.min_height.unwrap_or(320)
        }
    }

    /// Per-format default when `quality` is omitted: PNG 100 (no quantize), others 85.
    pub fn format_quality(&self, format: OutputFormat) -> u8 {
        if self.max_size_kb.is_some() {
            return (self.min_quality() + self.max_quality()) / 2;
        }
        match format {
            OutputFormat::Png => self.quality.unwrap_or(100),
            _ => self.quality.unwrap_or(85),
        }
    }

    #[allow(dead_code)]
    pub fn effective_quality(&self) -> u8 {
        self.format_quality(OutputFormat::Jpeg)
    }
}
