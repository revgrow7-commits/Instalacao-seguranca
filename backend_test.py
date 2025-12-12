#!/usr/bin/env python3
"""
Backend Test Suite for Fieldwork PWA
Tests complete check-in/check-out flow with GPS and Base64 photos
"""

import requests
import json
import base64
from datetime import datetime
import time

# Test configuration
BASE_URL = "https://install-pulse.preview.emergentagent.com/api"

# Test credentials
INSTALLER_CREDENTIALS = {
    "email": "instalador@industriavisual.com",
    "password": "instalador123"
}

ADMIN_CREDENTIALS = {
    "email": "admin@industriavisual.com", 
    "password": "admin123"
}

MANAGER_CREDENTIALS = {
    "email": "gerente@industriavisual.com",
    "password": "gerente123"
}

# GPS coordinates for testing (Porto Alegre, Brazil)
GPS_CHECKIN = {
    "lat": -30.0346,
    "long": -51.2177,
    "accuracy": 5.0
}

# GPS coordinates for checkout (slightly different location)
GPS_CHECKOUT = {
    "lat": -30.0356,
    "long": -51.2187,
    "accuracy": 3.0
}

# Small 1x1 pixel Base64 image for testing
TEST_IMAGE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

class FieldworkAPITest:
    def __init__(self):
        self.installer_token = None
        self.admin_token = None
        self.test_job_id = None
        self.test_checkin_id = None
        self.session = requests.Session()
        
    def log(self, message):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
        
    def test_login_installer(self):
        """Test 1: Login as installer"""
        self.log("Testing installer login...")
        
        response = self.session.post(
            f"{BASE_URL}/auth/login",
            json=INSTALLER_CREDENTIALS
        )
        
        if response.status_code != 200:
            self.log(f"❌ Installer login failed: {response.status_code} - {response.text}")
            return False
            
        data = response.json()
        if "access_token" not in data:
            self.log(f"❌ No access token in response: {data}")
            return False
            
        self.installer_token = data["access_token"]
        user_info = data.get("user", {})
        
        self.log(f"✅ Installer login successful")
        self.log(f"   User: {user_info.get('name')} ({user_info.get('email')})")
        self.log(f"   Role: {user_info.get('role')}")
        return True
        
    def test_login_admin(self):
        """Test 2: Login as admin"""
        self.log("Testing admin login...")
        
        response = self.session.post(
            f"{BASE_URL}/auth/login",
            json=ADMIN_CREDENTIALS
        )
        
        if response.status_code != 200:
            self.log(f"❌ Admin login failed: {response.status_code} - {response.text}")
            return False
            
        data = response.json()
        if "access_token" not in data:
            self.log(f"❌ No access token in response: {data}")
            return False
            
        self.admin_token = data["access_token"]
        user_info = data.get("user", {})
        
        self.log(f"✅ Admin login successful")
        self.log(f"   User: {user_info.get('name')} ({user_info.get('email')})")
        self.log(f"   Role: {user_info.get('role')}")
        return True
        
    def test_list_installer_jobs(self):
        """Test 3: List jobs assigned to installer"""
        self.log("Testing job listing for installer...")
        
        if not self.installer_token:
            self.log("❌ No installer token available")
            return False
            
        headers = {"Authorization": f"Bearer {self.installer_token}"}
        response = self.session.get(f"{BASE_URL}/jobs", headers=headers)
        
        if response.status_code != 200:
            self.log(f"❌ Job listing failed: {response.status_code} - {response.text}")
            return False
            
        jobs = response.json()
        self.log(f"✅ Job listing successful - Found {len(jobs)} jobs")
        
        if jobs:
            # Use first available job for testing
            self.test_job_id = jobs[0]["id"]
            job_info = jobs[0]
            self.log(f"   Using job: {job_info.get('title')} (ID: {self.test_job_id})")
            self.log(f"   Status: {job_info.get('status')}")
            self.log(f"   Client: {job_info.get('client_name')}")
        else:
            self.log("⚠️  No jobs found for installer")
            
        return True
        
    def test_checkin_with_gps_photo(self):
        """Test 4: Create check-in with GPS and Base64 photo"""
        self.log("Testing check-in with GPS and photo...")
        
        if not self.installer_token or not self.test_job_id:
            self.log("❌ Missing installer token or job ID")
            return False
            
        headers = {"Authorization": f"Bearer {self.installer_token}"}
        
        # Prepare form data
        form_data = {
            "job_id": self.test_job_id,
            "photo_base64": TEST_IMAGE_BASE64,
            "gps_lat": GPS_CHECKIN["lat"],
            "gps_long": GPS_CHECKIN["long"],
            "gps_accuracy": GPS_CHECKIN["accuracy"]
        }
        
        response = self.session.post(
            f"{BASE_URL}/checkins",
            data=form_data,
            headers=headers
        )
        
        if response.status_code != 200:
            self.log(f"❌ Check-in failed: {response.status_code} - {response.text}")
            return False
            
        checkin_data = response.json()
        self.test_checkin_id = checkin_data["id"]
        
        self.log(f"✅ Check-in successful")
        self.log(f"   Check-in ID: {self.test_checkin_id}")
        self.log(f"   GPS: {checkin_data.get('gps_lat')}, {checkin_data.get('gps_long')}")
        self.log(f"   Accuracy: {checkin_data.get('gps_accuracy')}m")
        self.log(f"   Status: {checkin_data.get('status')}")
        self.log(f"   Photo stored: {'Yes' if checkin_data.get('checkin_photo') else 'No'}")
        
        # Verify GPS coordinates were stored correctly
        if abs(checkin_data.get('gps_lat', 0) - GPS_CHECKIN["lat"]) > 0.001:
            self.log(f"⚠️  GPS latitude mismatch: expected {GPS_CHECKIN['lat']}, got {checkin_data.get('gps_lat')}")
            
        if abs(checkin_data.get('gps_long', 0) - GPS_CHECKIN["long"]) > 0.001:
            self.log(f"⚠️  GPS longitude mismatch: expected {GPS_CHECKIN['long']}, got {checkin_data.get('gps_long')}")
            
        return True
        
    def test_checkout_with_gps_photo(self):
        """Test 5: Check-out with GPS and Base64 photo"""
        self.log("Testing check-out with GPS and photo...")
        
        if not self.installer_token or not self.test_checkin_id:
            self.log("❌ Missing installer token or check-in ID")
            return False
            
        # Wait a moment to ensure duration calculation
        time.sleep(2)
        
        headers = {"Authorization": f"Bearer {self.installer_token}"}
        
        # Prepare form data
        form_data = {
            "photo_base64": TEST_IMAGE_BASE64,
            "gps_lat": GPS_CHECKOUT["lat"],
            "gps_long": GPS_CHECKOUT["long"],
            "gps_accuracy": GPS_CHECKOUT["accuracy"],
            "notes": "Instalação concluída com sucesso. Teste automatizado."
        }
        
        response = self.session.put(
            f"{BASE_URL}/checkins/{self.test_checkin_id}/checkout",
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
        self.log(f"   Checkout GPS: {checkout_data.get('checkout_gps_lat')}, {checkout_data.get('checkout_gps_long')}")
        self.log(f"   Checkout Accuracy: {checkout_data.get('checkout_gps_accuracy')}m")
        self.log(f"   Notes: {checkout_data.get('notes')}")
        self.log(f"   Checkout photo stored: {'Yes' if checkout_data.get('checkout_photo') else 'No'}")
        
        # Verify checkout GPS coordinates
        if abs(checkout_data.get('checkout_gps_lat', 0) - GPS_CHECKOUT["lat"]) > 0.001:
            self.log(f"⚠️  Checkout GPS latitude mismatch: expected {GPS_CHECKOUT['lat']}, got {checkout_data.get('checkout_gps_lat')}")
            
        if abs(checkout_data.get('checkout_gps_long', 0) - GPS_CHECKOUT["long"]) > 0.001:
            self.log(f"⚠️  Checkout GPS longitude mismatch: expected {GPS_CHECKOUT['long']}, got {checkout_data.get('checkout_gps_long')}")
            
        # Verify duration was calculated
        if not checkout_data.get('duration_minutes'):
            self.log("⚠️  Duration not calculated")
            
        return True
        
    def test_checkin_details_as_admin(self):
        """Test 6: View check-in details as admin/manager"""
        self.log("Testing check-in details view as admin...")
        
        if not self.admin_token or not self.test_checkin_id:
            self.log("❌ Missing admin token or check-in ID")
            return False
            
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        response = self.session.get(
            f"{BASE_URL}/checkins/{self.test_checkin_id}/details",
            headers=headers
        )
        
        if response.status_code != 200:
            self.log(f"❌ Check-in details failed: {response.status_code} - {response.text}")
            return False
            
        details = response.json()
        
        self.log(f"✅ Check-in details retrieved successfully")
        
        # Verify structure
        checkin = details.get("checkin", {})
        installer = details.get("installer", {})
        job = details.get("job", {})
        
        self.log(f"   Checkin data: {'Present' if checkin else 'Missing'}")
        self.log(f"   Installer data: {'Present' if installer else 'Missing'}")
        self.log(f"   Job data: {'Present' if job else 'Missing'}")
        
        if checkin:
            self.log(f"   Checkin photos: In={bool(checkin.get('checkin_photo'))}, Out={bool(checkin.get('checkout_photo'))}")
            self.log(f"   GPS data: In=({checkin.get('gps_lat')}, {checkin.get('gps_long')}), Out=({checkin.get('checkout_gps_lat')}, {checkin.get('checkout_gps_long')})")
            
        if installer:
            self.log(f"   Installer: {installer.get('full_name')} (Branch: {installer.get('branch')})")
            
        if job:
            self.log(f"   Job: {job.get('title')} - {job.get('client_name')}")
            
        # Verify Base64 photos can be decoded
        try:
            if checkin.get('checkin_photo'):
                base64.b64decode(checkin['checkin_photo'])
                self.log(f"   ✅ Check-in photo Base64 is valid")
            else:
                self.log(f"   ⚠️  No check-in photo found")
                
            if checkin.get('checkout_photo'):
                base64.b64decode(checkin['checkout_photo'])
                self.log(f"   ✅ Check-out photo Base64 is valid")
            else:
                self.log(f"   ⚠️  No check-out photo found")
                
        except Exception as e:
            self.log(f"   ❌ Base64 photo decode error: {e}")
            
        return True
        
    def test_job_scheduling_system(self):
        """Test 7: Job scheduling system"""
        self.log("Testing job scheduling system...")
        
        if not self.admin_token or not self.test_job_id:
            self.log("❌ Missing admin token or job ID")
            return False
            
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Test job update with scheduling
        update_data = {
            "status": "completed",
            "scheduled_date": "2024-01-15T10:00:00",
            "assigned_installers": ["test-installer-id"]
        }
        
        response = self.session.put(
            f"{BASE_URL}/jobs/{self.test_job_id}",
            json=update_data,
            headers=headers
        )
        
        if response.status_code != 200:
            self.log(f"❌ Job update failed: {response.status_code} - {response.text}")
            return False
            
        updated_job = response.json()
        
        self.log(f"✅ Job scheduling system working")
        self.log(f"   Status updated: {updated_job.get('status')}")
        self.log(f"   Scheduled date: {updated_job.get('scheduled_date')}")
        self.log(f"   Assigned installers: {updated_job.get('assigned_installers')}")
        
        # Verify Holdprint data preservation
        if updated_job.get('holdprint_data'):
            self.log(f"   ✅ Holdprint data preserved")
        else:
            self.log(f"   ⚠️  Holdprint data missing")
            
        return True
        
    def run_all_tests(self):
        """Run complete test suite"""
        self.log("=" * 60)
        self.log("FIELDWORK PWA - BACKEND API TEST SUITE")
        self.log("=" * 60)
        
        tests = [
            ("Installer Login", self.test_login_installer),
            ("Admin Login", self.test_login_admin),
            ("List Installer Jobs", self.test_list_installer_jobs),
            ("Check-in with GPS & Photo", self.test_checkin_with_gps_photo),
            ("Check-out with GPS & Photo", self.test_checkout_with_gps_photo),
            ("Check-in Details (Admin)", self.test_checkin_details_as_admin),
            ("Job Scheduling System", self.test_job_scheduling_system)
        ]
        
        results = []
        
        for test_name, test_func in tests:
            self.log(f"\n--- {test_name} ---")
            try:
                result = test_func()
                results.append((test_name, result))
            except Exception as e:
                self.log(f"❌ Test failed with exception: {e}")
                results.append((test_name, False))
                
        # Summary
        self.log("\n" + "=" * 60)
        self.log("TEST RESULTS SUMMARY")
        self.log("=" * 60)
        
        passed = 0
        failed = 0
        
        for test_name, result in results:
            status = "✅ PASS" if result else "❌ FAIL"
            self.log(f"{status} - {test_name}")
            if result:
                passed += 1
            else:
                failed += 1
                
        self.log(f"\nTotal: {len(results)} tests")
        self.log(f"Passed: {passed}")
        self.log(f"Failed: {failed}")
        
        if failed == 0:
            self.log("\n🎉 ALL TESTS PASSED!")
        else:
            self.log(f"\n⚠️  {failed} TEST(S) FAILED")
            
        return failed == 0

if __name__ == "__main__":
    tester = FieldworkAPITest()
    success = tester.run_all_tests()
    exit(0 if success else 1)