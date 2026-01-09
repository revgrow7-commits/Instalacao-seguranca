"""
Services package initialization.
"""
from services.product_classifier import classify_product_to_family, extract_product_measures, calculate_job_products_area
from services.holdprint import fetch_holdprint_jobs, extract_product_dimensions
from services.image import compress_image_to_base64, compress_base64_image
from services.gamification import (
    calculate_checkout_coins,
    add_coins,
    calculate_level,
    COIN_REWARDS
)
from services.gps import calculate_gps_distance

__all__ = [
    # Product classifier
    'classify_product_to_family', 'extract_product_measures', 'calculate_job_products_area',
    # Holdprint
    'fetch_holdprint_jobs', 'extract_product_dimensions',
    # Image
    'compress_image_to_base64', 'compress_base64_image',
    # Gamification
    'calculate_checkout_coins', 'add_coins', 'calculate_level', 'COIN_REWARDS',
    # GPS
    'calculate_gps_distance',
]
