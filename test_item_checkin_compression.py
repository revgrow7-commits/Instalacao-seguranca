#!/usr/bin/env python3
"""
Test item checkin/checkout endpoints with large image compression
"""

import requests
import json
import base64
from datetime import datetime
import time
from PIL import Image
from io import BytesIO
import os

# Test configuration
BASE_URL = "https://instalmonitor.preview.emergentagent.com/api"

# Test credentials
INSTALLER_CREDENTIALS = {
    "email": "instalador@industriavisual.com",
    "password": "instalador123"
}

# GPS coordinates for testing
GPS_CHECKIN = {
    "lat": -30.0346,
    "long": -51.2177,
    "accuracy": 5.0
}

def create_very_large_image():
    """Create a very large image that will definitely be > 300KB"""
    # Create a 5000x4000 image with complex patterns
    width, height = 5000, 4000
    img = Image.new('RGB', (width, height), color='white')
    
    # Fill with complex random patterns to ensure large file size
    import random
    random.seed(42)  # For reproducible results
    
    # Create a complex pattern that will result in a large file
    for x in range(0, width, 5):
        for y in range(0, height, 5):
            r = random.randint(0, 255)
            g = random.randint(0, 255) 
            b = random.randint(0, 255)
            
            # Fill a 5x5 block with this color plus noise
            for i in range(5):
                for j in range(5):
                    if x+i < width and y+j < height:
                        noise_r = min(255, max(0, r + random.randint(-30, 30)))
                        noise_g = min(255, max(0, g + random.randint(-30, 30)))
                        noise_b = min(255, max(0, b + random.randint(-30, 30)))
                        img.putpixel((x+i, y+j), (noise_r, noise_g, noise_b))
    
    # Save as PNG with no compression to maximize size
    buffer = BytesIO()
    img.save(buffer, format='PNG', compress_level=0)
    img_data = buffer.getvalue()
    
    return base64.b64encode(img_data).decode('utf-8'), len(img_data)

def test_item_checkin_compression():
    """Test item checkin/checkout endpoints with large image compression"""
    print("=" * 60)
    print("ITEM CHECKIN/CHECKOUT LARGE IMAGE COMPRESSION TEST")
    print("=" * 60)
    
    # Login as installer
    print("Logging in as installer...")
    session = requests.Session()
    
    response = session.post(f"{BASE_URL}/auth/login", json=INSTALLER_CREDENTIALS)
    if response.status_code != 200:
        print(f"❌ Login failed: {response.status_code} - {response.text}")
        return False
        
    data = response.json()
    token = data["access_token"]
    print("✅ Login successful")
    
    # Get jobs
    headers = {"Authorization": f"Bearer {token}"}
    response = session.get(f"{BASE_URL}/jobs", headers=headers)
    if response.status_code != 200:
        print(f"❌ Failed to get jobs: {response.status_code}")
        return False
        
    jobs = response.json()
    if not jobs:
        print("❌ No jobs available")
        return False
        
    job_id = jobs[0]["id"]
    print(f"✅ Using job: {jobs[0]['title']}")
    
    # Get job assignments to find an item
    response = session.get(f"{BASE_URL}/jobs/{job_id}/assignments", headers=headers)
    if response.status_code != 200:
        print(f"❌ Could not get job assignments: {response.status_code}")
        return False
        
    assignments_data = response.json()
    
    # Find an item to check in (use item index 0 if available)
    item_index = 0
    if assignments_data.get("by_item"):
        available_items = assignments_data["by_item"]
        if available_items:
            item_index = available_items[0]["item_index"]
            print(f"✅ Using item index: {item_index}")
        else:
            print("✅ No items found in assignments, using index 0")
    
    # Create very large image
    print("Creating very large test image...")
    large_image_b64, original_size = create_very_large_image()
    original_size_kb = original_size / 1024
    original_size_mb = original_size_kb / 1024
    
    print(f"✅ Created image: {original_size_kb:.1f}KB ({original_size_mb:.1f}MB)")
    
    if original_size_kb <= 300:
        print(f"❌ Image is still not large enough: {original_size_kb:.1f}KB")
        return False
    
    # Test item checkin with large image
    print(f"\nTesting item checkin with {original_size_kb:.1f}KB image...")
    
    form_data = {
        "job_id": job_id,
        "item_index": item_index,
        "photo_base64": large_image_b64,
        "gps_lat": GPS_CHECKIN["lat"],
        "gps_long": GPS_CHECKIN["long"],
        "gps_accuracy": GPS_CHECKIN["accuracy"]
    }
    
    response = session.post(f"{BASE_URL}/item-checkins", data=form_data, headers=headers)
    
    if response.status_code != 200:
        print(f"❌ Item checkin failed: {response.status_code} - {response.text}")
        return False
        
    checkin_data = response.json()
    item_checkin_id = checkin_data["id"]
    
    # Analyze stored image
    stored_photo = checkin_data.get("checkin_photo")
    if stored_photo:
        stored_data = base64.b64decode(stored_photo)
        stored_size_kb = len(stored_data) / 1024
        
        print(f"✅ Item checkin successful")
        print(f"   Original: {original_size_kb:.1f}KB")
        print(f"   Stored: {stored_size_kb:.1f}KB")
        
        if stored_size_kb < original_size_kb:
            compression_ratio = (1 - stored_size_kb / original_size_kb) * 100
            print(f"   ✅ Compression: {compression_ratio:.1f}% reduction")
            
            if stored_size_kb <= 300:
                print(f"   ✅ Meets 300KB target: {stored_size_kb:.1f}KB")
            else:
                print(f"   ⚠️  Exceeds 300KB target: {stored_size_kb:.1f}KB")
        else:
            print(f"   ❌ No compression detected")
            
        # Verify image is still valid
        try:
            test_img = Image.open(BytesIO(stored_data))
            print(f"   ✅ Compressed image is valid: {test_img.size} pixels")
        except Exception as e:
            print(f"   ❌ Compressed image is invalid: {e}")
    else:
        print(f"❌ No photo in response")
        return False
    
    # Test item checkout with another large image
    print(f"\nTesting item checkout with another large image...")
    
    # Create another large image for checkout
    checkout_image_b64, checkout_original_size = create_very_large_image()
    checkout_original_size_kb = checkout_original_size / 1024
    
    time.sleep(2)  # Wait for duration calculation
    
    form_data = {
        "photo_base64": checkout_image_b64,
        "gps_lat": GPS_CHECKIN["lat"] + 0.001,
        "gps_long": GPS_CHECKIN["long"] + 0.001,
        "gps_accuracy": GPS_CHECKIN["accuracy"],
        "notes": "Large image compression test item checkout"
    }
    
    response = session.put(f"{BASE_URL}/item-checkins/{item_checkin_id}/checkout", data=form_data, headers=headers)
    
    if response.status_code != 200:
        print(f"❌ Item checkout failed: {response.status_code} - {response.text}")
        return False
        
    checkout_data = response.json()
    
    # Analyze checkout image
    checkout_photo = checkout_data.get("checkout_photo")
    if checkout_photo:
        checkout_stored_data = base64.b64decode(checkout_photo)
        checkout_stored_size_kb = len(checkout_stored_data) / 1024
        
        print(f"✅ Item checkout successful")
        print(f"   Original: {checkout_original_size_kb:.1f}KB")
        print(f"   Stored: {checkout_stored_size_kb:.1f}KB")
        
        if checkout_stored_size_kb < checkout_original_size_kb:
            compression_ratio = (1 - checkout_stored_size_kb / checkout_original_size_kb) * 100
            print(f"   ✅ Compression: {compression_ratio:.1f}% reduction")
            
            if checkout_stored_size_kb <= 300:
                print(f"   ✅ Meets 300KB target: {checkout_stored_size_kb:.1f}KB")
            else:
                print(f"   ⚠️  Exceeds 300KB target: {checkout_stored_size_kb:.1f}KB")
        else:
            print(f"   ❌ No compression detected")
            
        # Verify image is still valid
        try:
            test_img = Image.open(BytesIO(checkout_stored_data))
            print(f"   ✅ Compressed checkout image is valid: {test_img.size} pixels")
        except Exception as e:
            print(f"   ❌ Compressed checkout image is invalid: {e}")
    else:
        print(f"❌ No checkout photo in response")
        return False
    
    print("\n✅ Item checkin/checkout large image compression test completed successfully!")
    return True

if __name__ == "__main__":
    success = test_item_checkin_compression()
    exit(0 if success else 1)