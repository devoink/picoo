use thiserror::Error;

#[derive(Debug, Error)]
pub enum PicooError {
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("unsupported format")]
    UnsupportedFormat,
    #[error("crop out of bounds")]
    CropOutOfBounds,
    #[error("target size unreachable")]
    TargetSizeUnreachable,
    #[error("process failed: {0}")]
    ProcessFailed(String),
}

impl PicooError {
    pub fn code(&self) -> &'static str {
        match self {
            PicooError::InvalidInput(_) => "INVALID_INPUT",
            PicooError::UnsupportedFormat => "UNSUPPORTED_FORMAT",
            PicooError::CropOutOfBounds => "CROP_OUT_OF_BOUNDS",
            PicooError::TargetSizeUnreachable => "TARGET_SIZE_UNREACHABLE",
            PicooError::ProcessFailed(_) => "PROCESS_FAILED",
        }
    }
}
