"""
Image compression service.
"""
import base64
import logging
from io import BytesIO
from PIL import Image


def compress_image_to_base64(image_data: bytes, max_size_kb: int = 300, max_dimension: int = 1200) -> str:
    """
    Compress image and return base64 string.
    """
    try:
        img = Image.open(BytesIO(image_data))
        
        # Convert to RGB if necessary
        if img.mode in ('RGBA', 'P', 'LA'):
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')
        
        # Resize if too large
        original_size = img.size
        if img.width > max_dimension or img.height > max_dimension:
            ratio = min(max_dimension / img.width, max_dimension / img.height)
            new_size = (int(img.width * ratio), int(img.height * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
            logging.info(f"Image resized from {original_size} to {img.size}")
        
        # Progressive compression
        quality = 85
        output = BytesIO()
        
        while quality >= 20:
            output = BytesIO()
            img.save(output, format='JPEG', quality=quality, optimize=True)
            size_kb = len(output.getvalue()) / 1024
            
            if size_kb <= max_size_kb:
                break
            quality -= 5
        
        final_size_kb = len(output.getvalue()) / 1024
        logging.info(f"Image compressed: {len(image_data)/1024:.1f}KB -> {final_size_kb:.1f}KB (quality={quality})")
        
        return base64.b64encode(output.getvalue()).decode('utf-8')
        
    except Exception as e:
        logging.error(f"Error compressing image: {str(e)}")
        return base64.b64encode(image_data).decode('utf-8')


def compress_base64_image(base64_string: str, max_size_kb: int = 300, max_dimension: int = 1200) -> str:
    """
    Compress a base64-encoded image string.
    """
    if not base64_string:
        return base64_string
    
    try:
        # Remove data URL prefix if present
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
        
        image_data = base64.b64decode(base64_string)
        original_size_kb = len(image_data) / 1024
        
        # Skip compression for small images
        if original_size_kb <= max_size_kb:
            logging.info(f"Image already small ({original_size_kb:.1f}KB), skipping compression")
            return base64_string
        
        return compress_image_to_base64(image_data, max_size_kb, max_dimension)
        
    except Exception as e:
        logging.error(f"Error in compress_base64_image: {str(e)}")
        return base64_string
