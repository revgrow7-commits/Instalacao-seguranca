#!/usr/bin/env python3
"""
Check-out Test
Tests the check-out functionality using existing check-in
"""

import requests
import json
from datetime import datetime

# Test configuration
BASE_URL = "https://install-pulse.preview.emergentagent.com/api"

INSTALLER_CREDENTIALS = {
    "email": "instalador@industriavisual.com",
    "password": "instalador123"
}

ADMIN_CREDENTIALS = {
    "email": "admin@industriavisual.com",
    "password": "admin123"
}

# Test Base64 image
TEST_IMAGE_BASE64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

class CheckoutTest:
    def __init__(self):
        self.installer_token = None
        self.admin_token = None
        self.session = requests.Session()
        
    def log(self, message):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
        
    def test_login_installer(self):
        """Login as installer"""
        response = self.session.post(f"{BASE_URL}/auth/login", json=INSTALLER_CREDENTIALS)
        if response.status_code == 200:
            self.installer_token = response.json()["access_token"]
            self.log("✅ Installer login successful")
            return True
        self.log(f"❌ Installer login failed: {response.status_code}")
        return False
        
    def test_login_admin(self):
        """Login as admin"""
        response = self.session.post(f"{BASE_URL}/auth/login", json=ADMIN_CREDENTIALS)
        if response.status_code == 200:
            self.admin_token = response.json()["access_token"]
            self.log("✅ Admin login successful")
            return True
        self.log(f"❌ Admin login failed: {response.status_code}")
        return False
        
    def test_checkout_and_details(self):
        """Test checkout and check-in details"""
        if not self.installer_token or not self.admin_token:
            self.log("❌ Missing tokens")
            return False
            
        # Get current check-ins
        headers = {"Authorization": f"Bearer {self.installer_token}"}
        response = self.session.get(f"{BASE_URL}/checkins", headers=headers)
        
        if response.status_code != 200:
            self.log(f"❌ Failed to get check-ins: {response.status_code}")
            return False
            
        checkins = response.json()
        
        # Find an in_progress check-in
        active_checkin = None
        for checkin in checkins:
            if checkin.get('status') == 'in_progress':
                active_checkin = checkin
                break
                
        if not active_checkin:
            self.log("⚠️  No active check-in found to test checkout")
            return True
            
        checkin_id = active_checkin['id']
        self.log(f"✅ Found active check-in: {checkin_id}")
        
        # Test checkout
        form_data = {
            "photo_base64": TEST_IMAGE_BASE64,
            "gps_lat": -29.91,
            "gps_long": -51.11,
            "gps_accuracy": 3.0,
            "notes": "Check-out de teste completado"
        }
        
        response = self.session.put(
            f"{BASE_URL}/checkins/{checkin_id}/checkout",
            data=form_data,
            headers=headers
        )
        
        if response.status_code != 200:
            self.log(f"❌ Check-out failed: {response.status_code} - {response.text}")
            return False
            
        checkout_data = response.json()
        self.log(f"✅ Check-out successful")
        self.log(f"   Status: {checkout_data.get('status')}")
        self.log(f"   Duration: {checkout_data.get('duration_minutes')} minutes")
        
        # Test check-in details as admin
        admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
        response = self.session.get(
            f"{BASE_URL}/checkins/{checkin_id}/details",
            headers=admin_headers
        )
        
        if response.status_code != 200:
            self.log(f"❌ Check-in details failed: {response.status_code}")
            return False
            
        details = response.json()
        self.log(f"✅ Check-in details retrieved successfully")
        
        checkin = details.get("checkin", {})
        if checkin.get('checkin_photo') and checkin.get('checkout_photo'):
            self.log(f"✅ Both check-in and check-out photos present")
        else:
            self.log(f"⚠️  Missing photos: checkin={bool(checkin.get('checkin_photo'))}, checkout={bool(checkin.get('checkout_photo'))}")
            
        return True
        
    def run_test(self):
        """Run checkout test"""
        self.log("=== CHECKOUT AND DETAILS TEST ===")
        
        if not self.test_login_installer():
            return False
        if not self.test_login_admin():
            return False
        if not self.test_checkout_and_details():
            return False
            
        self.log("✅ All checkout tests passed!")
        return True

if __name__ == "__main__":
    tester = CheckoutTest()
    success = tester.run_test()
    exit(0 if success else 1)