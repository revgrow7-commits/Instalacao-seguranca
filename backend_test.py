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
BASE_URL = "https://instalmonitor.preview.emergentagent.com/api"

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
        self.manager_token = None
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
        
    def test_login_manager(self):
        """Test 2b: Login as manager"""
        self.log("Testing manager login...")
        
        response = self.session.post(
            f"{BASE_URL}/auth/login",
            json=MANAGER_CREDENTIALS
        )
        
        if response.status_code != 200:
            self.log(f"❌ Manager login failed: {response.status_code} - {response.text}")
            return False
            
        data = response.json()
        if "access_token" not in data:
            self.log(f"❌ No access token in response: {data}")
            return False
            
        self.manager_token = data["access_token"]
        user_info = data.get("user", {})
        
        self.log(f"✅ Manager login successful")
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
        
    def test_checkout_with_productivity_metrics(self):
        """Test 5: Check-out with GPS, photo and productivity metrics"""
        self.log("Testing check-out with GPS, photo and productivity metrics...")
        
        if not self.installer_token or not self.test_checkin_id:
            self.log("❌ Missing installer token or check-in ID")
            return False
            
        # Wait a moment to ensure duration calculation
        time.sleep(2)
        
        headers = {"Authorization": f"Bearer {self.installer_token}"}
        
        # Prepare form data with new productivity metrics fields
        form_data = {
            "photo_base64": TEST_IMAGE_BASE64,
            "gps_lat": GPS_CHECKOUT["lat"],
            "gps_long": GPS_CHECKOUT["long"],
            "gps_accuracy": GPS_CHECKOUT["accuracy"],
            "installed_m2": 25.5,  # M² instalado
            "complexity_level": 4,  # Escala 1-5, 4=Difícil
            "height_category": "alta",  # terreo, media, alta, muito_alta
            "scenario_category": "fachada",  # loja_rua, shopping, evento, fachada, outdoor, veiculo
            "difficulty_description": "Trabalho em altura exigiu equipamento especial",
            "notes": "Instalação concluída com sucesso"
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
        
        # Verify new productivity metrics fields
        self.log(f"   Installed M²: {checkout_data.get('installed_m2')}")
        self.log(f"   Complexity Level: {checkout_data.get('complexity_level')}")
        self.log(f"   Height Category: {checkout_data.get('height_category')}")
        self.log(f"   Scenario Category: {checkout_data.get('scenario_category')}")
        self.log(f"   Difficulty Description: {checkout_data.get('difficulty_description')}")
        self.log(f"   Productivity (m²/h): {checkout_data.get('productivity_m2_h')}")
        
        # Verify checkout GPS coordinates
        if abs(checkout_data.get('checkout_gps_lat', 0) - GPS_CHECKOUT["lat"]) > 0.001:
            self.log(f"⚠️  Checkout GPS latitude mismatch: expected {GPS_CHECKOUT['lat']}, got {checkout_data.get('checkout_gps_lat')}")
            
        if abs(checkout_data.get('checkout_gps_long', 0) - GPS_CHECKOUT["long"]) > 0.001:
            self.log(f"⚠️  Checkout GPS longitude mismatch: expected {GPS_CHECKOUT['long']}, got {checkout_data.get('checkout_gps_long')}")
            
        # Verify duration was calculated
        if not checkout_data.get('duration_minutes'):
            self.log("⚠️  Duration not calculated")
            
        # Verify productivity metrics were saved correctly
        expected_values = {
            'installed_m2': 25.5,
            'complexity_level': 4,
            'height_category': 'alta',
            'scenario_category': 'fachada',
            'difficulty_description': 'Trabalho em altura exigiu equipamento especial'
        }
        
        for field, expected in expected_values.items():
            actual = checkout_data.get(field)
            if actual != expected:
                self.log(f"⚠️  {field} mismatch: expected {expected}, got {actual}")
            else:
                self.log(f"   ✅ {field} saved correctly: {actual}")
                
        # Verify productivity calculation
        if checkout_data.get('productivity_m2_h'):
            self.log(f"   ✅ Productivity calculated automatically: {checkout_data.get('productivity_m2_h')} m²/h")
        else:
            self.log(f"   ⚠️  Productivity not calculated")
            
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
        
    def test_productivity_report(self):
        """Test 8: Verify productivity report shows installer with reported m²"""
        self.log("Testing productivity report...")
        
        if not self.manager_token:
            self.log("❌ Missing manager token")
            return False
            
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        
        response = self.session.get(
            f"{BASE_URL}/reports/by-installer",
            headers=headers
        )
        
        if response.status_code != 200:
            self.log(f"❌ Productivity report failed: {response.status_code} - {response.text}")
            return False
            
        report_data = response.json()
        
        self.log(f"✅ Productivity report retrieved successfully")
        
        # Check if report contains installer data
        if isinstance(report_data, list):
            installers_found = len(report_data)
            self.log(f"   Found {installers_found} installers in report")
            
            # Look for our test installer
            test_installer_found = False
            for installer_data in report_data:
                installer_name = installer_data.get('installer_name', '')
                total_m2 = installer_data.get('total_m2', 0)
                
                self.log(f"   Installer: {installer_name} - Total M²: {total_m2}")
                
                # Check if this installer has the m² we just reported
                if total_m2 >= 25.5:  # Should include our 25.5 m²
                    test_installer_found = True
                    self.log(f"   ✅ Found installer with reported m² (≥25.5): {installer_name}")
                    
            if not test_installer_found:
                self.log(f"   ⚠️  No installer found with the expected m² (≥25.5)")
                
        elif isinstance(report_data, dict):
            self.log(f"   Report structure: {list(report_data.keys())}")
            
            # Check if there's installer data in the report
            if 'installers' in report_data:
                installers = report_data['installers']
                self.log(f"   Found {len(installers)} installers in report")
                
                for installer_data in installers:
                    installer_name = installer_data.get('name', installer_data.get('installer_name', ''))
                    total_m2 = installer_data.get('total_m2', 0)
                    self.log(f"   Installer: {installer_name} - Total M²: {total_m2}")
            else:
                self.log(f"   Report data keys: {list(report_data.keys())}")
        else:
            self.log(f"   Unexpected report format: {type(report_data)}")
            
        return True
        
    def test_google_calendar_login_endpoint(self):
        """Test 9: Google Calendar login endpoint - should return authorization URL"""
        self.log("Testing Google Calendar login endpoint...")
        
        if not self.manager_token:
            self.log("❌ Missing manager token")
            return False
            
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        
        response = self.session.get(
            f"{BASE_URL}/auth/google/login",
            headers=headers
        )
        
        if response.status_code != 200:
            self.log(f"❌ Google login endpoint failed: {response.status_code} - {response.text}")
            return False
            
        data = response.json()
        
        self.log(f"✅ Google login endpoint successful")
        
        # Verify response contains authorization URL
        if "authorization_url" in data:
            auth_url = data["authorization_url"]
            self.log(f"   Authorization URL: {auth_url[:100]}...")
            
            # Verify URL contains expected Google OAuth parameters
            expected_params = ["accounts.google.com", "client_id", "redirect_uri", "scope", "response_type=code"]
            for param in expected_params:
                if param not in auth_url:
                    self.log(f"   ⚠️  Missing expected parameter in URL: {param}")
                else:
                    self.log(f"   ✅ Found expected parameter: {param}")
                    
            # Verify Google Calendar scope is included
            if "calendar" in auth_url:
                self.log(f"   ✅ Google Calendar scope included")
            else:
                self.log(f"   ⚠️  Google Calendar scope not found in URL")
                
        else:
            self.log(f"   ❌ No authorization_url in response: {data}")
            return False
            
        return True
        
    def test_google_calendar_status_endpoint(self):
        """Test 10: Google Calendar status endpoint - should return connection status"""
        self.log("Testing Google Calendar status endpoint...")
        
        if not self.manager_token:
            self.log("❌ Missing manager token")
            return False
            
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        
        response = self.session.get(
            f"{BASE_URL}/auth/google/status",
            headers=headers
        )
        
        if response.status_code != 200:
            self.log(f"❌ Google status endpoint failed: {response.status_code} - {response.text}")
            return False
            
        data = response.json()
        
        self.log(f"✅ Google status endpoint successful")
        
        # Verify response structure
        expected_fields = ["connected"]
        for field in expected_fields:
            if field in data:
                self.log(f"   ✅ Field '{field}' present: {data[field]}")
            else:
                self.log(f"   ❌ Missing expected field: {field}")
                return False
                
        # Should initially be false (not connected)
        if data.get("connected") == False:
            self.log(f"   ✅ Initially not connected (expected)")
        else:
            self.log(f"   ⚠️  Connection status: {data.get('connected')} (may be connected from previous tests)")
            
        # Check for google_email field when connected
        if data.get("connected") and "google_email" in data:
            self.log(f"   ✅ Google email present when connected: {data.get('google_email')}")
        elif not data.get("connected") and data.get("google_email") is None:
            self.log(f"   ✅ No Google email when not connected (expected)")
            
        return True
        
    def test_google_calendar_events_unauthorized(self):
        """Test 11: Google Calendar events endpoint - should return 401 when not connected"""
        self.log("Testing Google Calendar events endpoint (unauthorized)...")
        
        if not self.manager_token:
            self.log("❌ Missing manager token")
            return False
            
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        
        # Test POST /api/calendar/events (create event)
        event_data = {
            "title": "Test Event",
            "description": "Test event for API testing",
            "start_datetime": "2024-12-20T10:00:00Z",
            "end_datetime": "2024-12-20T11:00:00Z",
            "location": "Test Location"
        }
        
        response = self.session.post(
            f"{BASE_URL}/calendar/events",
            json=event_data,
            headers=headers
        )
        
        # Should return 401 when Google Calendar is not connected
        if response.status_code == 401:
            self.log(f"✅ Calendar events POST correctly returns 401 when not connected")
            
            # Check error message
            try:
                error_data = response.json()
                if "Google Calendar não conectado" in error_data.get("detail", ""):
                    self.log(f"   ✅ Correct error message: {error_data.get('detail')}")
                else:
                    self.log(f"   ⚠️  Unexpected error message: {error_data.get('detail')}")
            except:
                self.log(f"   ⚠️  Could not parse error response")
                
        else:
            self.log(f"❌ Expected 401, got {response.status_code} - {response.text}")
            return False
            
        # Test GET /api/calendar/events (list events)
        response = self.session.get(
            f"{BASE_URL}/calendar/events",
            headers=headers
        )
        
        if response.status_code == 401:
            self.log(f"✅ Calendar events GET correctly returns 401 when not connected")
        else:
            self.log(f"❌ Expected 401 for GET, got {response.status_code} - {response.text}")
            return False
            
        return True

    def run_all_tests(self):
        """Run complete test suite"""
        self.log("=" * 60)
        self.log("FIELDWORK PWA - BACKEND API TEST SUITE")
        self.log("=" * 60)
        
        tests = [
            ("Installer Login", self.test_login_installer),
            ("Manager Login", self.test_login_manager),
            ("Admin Login", self.test_login_admin),
            ("List Installer Jobs", self.test_list_installer_jobs),
            ("Check-in with GPS & Photo", self.test_checkin_with_gps_photo),
            ("Check-out with Productivity Metrics", self.test_checkout_with_productivity_metrics),
            ("Check-in Details (Admin)", self.test_checkin_details_as_admin),
            ("Job Scheduling System", self.test_job_scheduling_system),
            ("Productivity Report (Manager)", self.test_productivity_report),
            ("Google Calendar Login Endpoint", self.test_google_calendar_login_endpoint),
            ("Google Calendar Status Endpoint", self.test_google_calendar_status_endpoint),
            ("Google Calendar Events (Unauthorized)", self.test_google_calendar_events_unauthorized)
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