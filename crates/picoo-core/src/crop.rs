use image::DynamicImage;

use crate::error::PicooError;
use crate::options::CropOptions;

pub fn apply(img: DynamicImage, crop: &Option<CropOptions>) -> Result<DynamicImage, PicooError> {
    let Some(crop) = crop else {
        return Ok(img);
    };

    let (w, h) = (img.width(), img.height());
    if crop.x + crop.width > w || crop.y + crop.height > h {
        return Err(PicooError::CropOutOfBounds);
    }
    if crop.width == 0 || crop.height == 0 {
        return Err(PicooError::InvalidInput(
            "crop dimensions must be > 0".into(),
        ));
    }

    Ok(img.crop_imm(crop.x, crop.y, crop.width, crop.height))
}
