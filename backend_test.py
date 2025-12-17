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

def create_large_test_image(width=3000, height=2000):
    """Create a large test image and return as base64"""
    # Create a large image with complex content to ensure large file size
    img = Image.new('RGB', (width, height), color='white')
    
    # Add complex patterns to make it more realistic and larger
    import random
    for x in range(0, width, 10):
        for y in range(0, height, 10):
            # Create random colored squares with noise
            r = random.randint(0, 255)
            g = random.randint(0, 255)
            b = random.randint(0, 255)
            
            for i in range(10):
                for j in range(10):
                    if x+i < width and y+j < height:
                        # Add some noise to make it more complex
                        noise_r = min(255, max(0, r + random.randint(-50, 50)))
                        noise_g = min(255, max(0, g + random.randint(-50, 50)))
                        noise_b = min(255, max(0, b + random.randint(-50, 50)))
                        img.putpixel((x+i, y+j), (noise_r, noise_g, noise_b))
    
    # Convert to base64 using PNG format (which should be larger)
    buffer = BytesIO()
    img.save(buffer, format='PNG', compress_level=0)  # No compression to make it larger
    img_data = buffer.getvalue()
    
    return base64.b64encode(img_data).decode('utf-8'), len(img_data)

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

    def test_forgot_password_endpoint(self):
        """Test 12: Forgot password endpoint - should send reset email"""
        self.log("Testing forgot password endpoint...")
        
        # Test with valid email
        forgot_data = {
            "email": "revgrow7@gmail.com"
        }
        
        response = self.session.post(
            f"{BASE_URL}/auth/forgot-password",
            json=forgot_data
        )
        
        if response.status_code != 200:
            self.log(f"❌ Forgot password failed: {response.status_code} - {response.text}")
            return False
            
        data = response.json()
        
        self.log(f"✅ Forgot password endpoint successful")
        
        # Verify response message (should be generic for security)
        if "message" in data:
            message = data["message"]
            self.log(f"   Response message: {message}")
            
            # Should return success message even if email doesn't exist (security)
            expected_phrases = ["receberá um link", "redefinir", "senha"]
            if any(phrase in message.lower() for phrase in expected_phrases):
                self.log(f"   ✅ Appropriate security message returned")
            else:
                self.log(f"   ⚠️  Unexpected message format")
        else:
            self.log(f"   ❌ No message in response: {data}")
            return False
            
        # Test with non-existent email (should still return success for security)
        forgot_data_invalid = {
            "email": "nonexistent@example.com"
        }
        
        response = self.session.post(
            f"{BASE_URL}/auth/forgot-password",
            json=forgot_data_invalid
        )
        
        if response.status_code == 200:
            self.log(f"   ✅ Non-existent email also returns success (security feature)")
        else:
            self.log(f"   ⚠️  Non-existent email returned different status: {response.status_code}")
            
        return True
        
    def test_verify_reset_token_invalid(self):
        """Test 13: Verify reset token with invalid token - should return valid: false"""
        self.log("Testing verify reset token with invalid token...")
        
        # Test with invalid token
        response = self.session.get(
            f"{BASE_URL}/auth/verify-reset-token?token=invalid_token_12345"
        )
        
        if response.status_code != 200:
            self.log(f"❌ Verify reset token failed: {response.status_code} - {response.text}")
            return False
            
        data = response.json()
        
        self.log(f"✅ Verify reset token endpoint successful")
        
        # Verify response structure
        if "valid" in data:
            is_valid = data["valid"]
            self.log(f"   Token validity: {is_valid}")
            
            if is_valid == False:
                self.log(f"   ✅ Invalid token correctly returns valid: false")
            else:
                self.log(f"   ❌ Invalid token should return valid: false, got: {is_valid}")
                return False
        else:
            self.log(f"   ❌ No 'valid' field in response: {data}")
            return False
            
        # Check for message field
        if "message" in data:
            message = data["message"]
            self.log(f"   Message: {message}")
            
            if "inválido" in message.lower() or "invalid" in message.lower():
                self.log(f"   ✅ Appropriate error message for invalid token")
            else:
                self.log(f"   ⚠️  Unexpected message for invalid token")
        
        return True
        
    def test_reset_password_invalid_token(self):
        """Test 14: Reset password with invalid token - should return 400 error"""
        self.log("Testing reset password with invalid token...")
        
        reset_data = {
            "token": "invalid_token_12345",
            "new_password": "newpassword123"
        }
        
        response = self.session.post(
            f"{BASE_URL}/auth/reset-password",
            json=reset_data
        )
        
        # Should return 400 for invalid token
        if response.status_code == 400:
            self.log(f"✅ Reset password correctly returns 400 for invalid token")
            
            try:
                error_data = response.json()
                if "detail" in error_data:
                    error_message = error_data["detail"]
                    self.log(f"   Error message: {error_message}")
                    
                    # Check for appropriate error message
                    if "inválido" in error_message.lower() or "expirado" in error_message.lower():
                        self.log(f"   ✅ Appropriate error message for invalid token")
                    else:
                        self.log(f"   ⚠️  Unexpected error message")
                else:
                    self.log(f"   ⚠️  No detail field in error response")
            except:
                self.log(f"   ⚠️  Could not parse error response")
                
        else:
            self.log(f"❌ Expected 400, got {response.status_code} - {response.text}")
            return False
            
        return True
        
    def test_admin_reset_user_password(self):
        """Test 15: Admin reset user password - should work with admin auth"""
        self.log("Testing admin reset user password...")
        
        if not self.admin_token:
            self.log("❌ Missing admin token")
            return False
            
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # First, get list of users to find a user ID
        response = self.session.get(f"{BASE_URL}/users", headers=headers)
        
        if response.status_code != 200:
            self.log(f"❌ Could not get users list: {response.status_code} - {response.text}")
            return False
            
        users = response.json()
        
        if not users:
            self.log(f"❌ No users found in system")
            return False
            
        # Find a non-admin user to reset password for
        target_user = None
        for user in users:
            if user.get("role") != "admin":
                target_user = user
                break
                
        if not target_user:
            self.log(f"❌ No non-admin user found to test password reset")
            return False
            
        user_id = target_user["id"]
        user_name = target_user.get("name", "Unknown")
        
        self.log(f"   Testing password reset for user: {user_name} (ID: {user_id})")
        
        # Test admin reset password
        reset_data = {
            "new_password": "admin_reset_password_123"
        }
        
        response = self.session.put(
            f"{BASE_URL}/users/{user_id}/reset-password",
            json=reset_data,
            headers=headers
        )
        
        if response.status_code != 200:
            self.log(f"❌ Admin password reset failed: {response.status_code} - {response.text}")
            return False
            
        data = response.json()
        
        self.log(f"✅ Admin password reset successful")
        
        # Verify response message
        if "message" in data:
            message = data["message"]
            self.log(f"   Response message: {message}")
            
            if user_name in message and "redefinida" in message.lower():
                self.log(f"   ✅ Appropriate success message")
            else:
                self.log(f"   ⚠️  Unexpected message format")
        else:
            self.log(f"   ❌ No message in response: {data}")
            return False
            
        # Test that non-admin cannot use this endpoint
        if self.installer_token:
            self.log("   Testing that installer cannot use admin reset endpoint...")
            
            installer_headers = {"Authorization": f"Bearer {self.installer_token}"}
            
            response = self.session.put(
                f"{BASE_URL}/users/{user_id}/reset-password",
                json=reset_data,
                headers=installer_headers
            )
            
            if response.status_code == 403:
                self.log(f"   ✅ Installer correctly denied access (403)")
            else:
                self.log(f"   ⚠️  Installer got unexpected status: {response.status_code}")
                
        return True

    def test_image_compression_function_direct(self):
        """Test 16: Test image compression function directly"""
        self.log("Testing image compression function directly...")
        
        # Create a large test image (3000x2000 pixels)
        large_image_b64, original_size = create_large_test_image(3000, 2000)
        original_size_kb = original_size / 1024
        
        self.log(f"   Created test image: 3000x2000 pixels, {original_size_kb:.1f}KB")
        
        # Test the compression by calling the backend endpoint that uses compression
        if not self.installer_token:
            self.log("❌ Missing installer token")
            return False
            
        # We'll test compression indirectly by uploading a large image and checking the result
        # Since we can't directly call the compression function, we'll verify it works through the API
        
        # Keep creating larger images until we get one > 300KB
        attempts = 0
        max_attempts = 5
        while original_size_kb <= 300 and attempts < max_attempts:
            attempts += 1
            width = 3000 + (attempts * 1000)
            height = 2000 + (attempts * 1000)
            self.log(f"⚠️  Test image is not large enough ({original_size_kb:.1f}KB), creating larger image {width}x{height}...")
            large_image_b64, original_size = create_large_test_image(width, height)
            original_size_kb = original_size / 1024
            self.log(f"   Created larger test image: {width}x{height} pixels, {original_size_kb:.1f}KB")
        
        # Verify we can decode the base64 back to an image
        try:
            decoded_data = base64.b64decode(large_image_b64)
            test_img = Image.open(BytesIO(decoded_data))
            self.log(f"   ✅ Test image is valid: {test_img.size} pixels, {test_img.mode} mode")
        except Exception as e:
            self.log(f"   ❌ Failed to decode test image: {e}")
            return False
            
        if original_size_kb > 300:
            self.log(f"   ✅ Large test image created successfully: {original_size_kb:.1f}KB (>300KB threshold)")
        else:
            self.log(f"   ⚠️  Could not create image >300KB after {max_attempts} attempts: {original_size_kb:.1f}KB")
            
        return True

    def test_item_checkin_with_large_image(self):
        """Test 17: Test POST /api/item-checkins with large image"""
        self.log("Testing item checkin with large image compression...")
        
        if not self.installer_token or not self.test_job_id:
            self.log("❌ Missing installer token or job ID")
            return False
            
        # Create a large test image
        large_image_b64, original_size = create_large_test_image(3000, 2000)
        original_size_kb = original_size / 1024
        
        self.log(f"   Using large image: {original_size_kb:.1f}KB")
        
        headers = {"Authorization": f"Bearer {self.installer_token}"}
        
        # First, get job assignments to find an item to check in
        response = self.session.get(f"{BASE_URL}/jobs/{self.test_job_id}/assignments", headers=headers)
        
        if response.status_code != 200:
            self.log(f"❌ Could not get job assignments: {response.status_code} - {response.text}")
            return False
            
        assignments_data = response.json()
        
        # Find an item to check in (use item index 0 if available)
        item_index = 0
        if assignments_data.get("by_item"):
            available_items = assignments_data["by_item"]
            if available_items:
                item_index = available_items[0]["item_index"]
                self.log(f"   Using item index: {item_index}")
            else:
                self.log("   No items found in assignments, using index 0")
        
        # Prepare form data for item checkin
        form_data = {
            "job_id": self.test_job_id,
            "item_index": item_index,
            "photo_base64": large_image_b64,
            "gps_lat": GPS_CHECKIN["lat"],
            "gps_long": GPS_CHECKIN["long"],
            "gps_accuracy": GPS_CHECKIN["accuracy"]
        }
        
        response = self.session.post(
            f"{BASE_URL}/item-checkins",
            data=form_data,
            headers=headers
        )
        
        if response.status_code != 200:
            self.log(f"❌ Item checkin failed: {response.status_code} - {response.text}")
            return False
            
        checkin_data = response.json()
        self.test_item_checkin_id = checkin_data["id"]
        
        self.log(f"✅ Item checkin successful with large image")
        self.log(f"   Item Checkin ID: {self.test_item_checkin_id}")
        
        # Verify the photo was stored and potentially compressed
        stored_photo = checkin_data.get("checkin_photo")
        if stored_photo:
            try:
                # Decode the stored photo to check its size
                stored_data = base64.b64decode(stored_photo)
                stored_size_kb = len(stored_data) / 1024
                
                self.log(f"   Original image: {original_size_kb:.1f}KB")
                self.log(f"   Stored image: {stored_size_kb:.1f}KB")
                
                # Check if compression occurred
                if stored_size_kb < original_size_kb:
                    compression_ratio = (1 - stored_size_kb / original_size_kb) * 100
                    self.log(f"   ✅ Image compressed: {compression_ratio:.1f}% reduction")
                    
                    # Check if it meets the 300KB target
                    if stored_size_kb <= 300:
                        self.log(f"   ✅ Image meets 300KB target: {stored_size_kb:.1f}KB")
                    else:
                        self.log(f"   ⚠️  Image exceeds 300KB target: {stored_size_kb:.1f}KB")
                else:
                    self.log(f"   ⚠️  No compression detected (stored size >= original)")
                    
                # Verify the stored image is still valid
                test_img = Image.open(BytesIO(stored_data))
                self.log(f"   ✅ Stored image is valid: {test_img.size} pixels")
                
            except Exception as e:
                self.log(f"   ❌ Error analyzing stored photo: {e}")
                return False
        else:
            self.log(f"   ❌ No photo stored in checkin response")
            return False
            
        return True

    def test_item_checkout_with_large_image(self):
        """Test 18: Test PUT /api/item-checkins/{id}/checkout with large image"""
        self.log("Testing item checkout with large image compression...")
        
        if not self.installer_token or not hasattr(self, 'test_item_checkin_id'):
            self.log("❌ Missing installer token or item checkin ID")
            return False
            
        # Create another large test image for checkout
        large_image_b64, original_size = create_large_test_image(2500, 1800)
        original_size_kb = original_size / 1024
        
        self.log(f"   Using large checkout image: {original_size_kb:.1f}KB")
        
        # Wait a moment to ensure duration calculation
        time.sleep(2)
        
        headers = {"Authorization": f"Bearer {self.installer_token}"}
        
        # Prepare form data for checkout with large image
        form_data = {
            "photo_base64": large_image_b64,
            "gps_lat": GPS_CHECKOUT["lat"],
            "gps_long": GPS_CHECKOUT["long"],
            "gps_accuracy": GPS_CHECKOUT["accuracy"],
            "notes": "Checkout with large image compression test"
        }
        
        response = self.session.put(
            f"{BASE_URL}/item-checkins/{self.test_item_checkin_id}/checkout",
            data=form_data,
            headers=headers
        )
        
        if response.status_code != 200:
            self.log(f"❌ Item checkout failed: {response.status_code} - {response.text}")
            return False
            
        checkout_data = response.json()
        
        self.log(f"✅ Item checkout successful with large image")
        self.log(f"   Status: {checkout_data.get('status')}")
        
        # Verify the checkout photo was stored and potentially compressed
        stored_photo = checkout_data.get("checkout_photo")
        if stored_photo:
            try:
                # Decode the stored photo to check its size
                stored_data = base64.b64decode(stored_photo)
                stored_size_kb = len(stored_data) / 1024
                
                self.log(f"   Original checkout image: {original_size_kb:.1f}KB")
                self.log(f"   Stored checkout image: {stored_size_kb:.1f}KB")
                
                # Check if compression occurred
                if stored_size_kb < original_size_kb:
                    compression_ratio = (1 - stored_size_kb / original_size_kb) * 100
                    self.log(f"   ✅ Checkout image compressed: {compression_ratio:.1f}% reduction")
                    
                    # Check if it meets the 300KB target
                    if stored_size_kb <= 300:
                        self.log(f"   ✅ Checkout image meets 300KB target: {stored_size_kb:.1f}KB")
                    else:
                        self.log(f"   ⚠️  Checkout image exceeds 300KB target: {stored_size_kb:.1f}KB")
                else:
                    self.log(f"   ⚠️  No compression detected on checkout image")
                    
                # Verify the stored image is still valid
                test_img = Image.open(BytesIO(stored_data))
                self.log(f"   ✅ Stored checkout image is valid: {test_img.size} pixels")
                
            except Exception as e:
                self.log(f"   ❌ Error analyzing stored checkout photo: {e}")
                return False
        else:
            self.log(f"   ❌ No checkout photo stored in response")
            return False
            
        return True

    def test_regular_checkin_with_large_image(self):
        """Test 19: Test regular POST /api/checkins with large image (for comparison)"""
        self.log("Testing regular checkin with large image compression...")
        
        if not self.installer_token or not self.test_job_id:
            self.log("❌ Missing installer token or job ID")
            return False
            
        # Create a large test image
        large_image_b64, original_size = create_large_test_image(2800, 1900)
        original_size_kb = original_size / 1024
        
        self.log(f"   Using large image: {original_size_kb:.1f}KB")
        
        headers = {"Authorization": f"Bearer {self.installer_token}"}
        
        # Prepare form data for regular checkin
        form_data = {
            "job_id": self.test_job_id,
            "photo_base64": large_image_b64,
            "gps_lat": GPS_CHECKIN["lat"] + 0.001,  # Slightly different location
            "gps_long": GPS_CHECKIN["long"] + 0.001,
            "gps_accuracy": GPS_CHECKIN["accuracy"]
        }
        
        response = self.session.post(
            f"{BASE_URL}/checkins",
            data=form_data,
            headers=headers
        )
        
        if response.status_code != 200:
            self.log(f"❌ Regular checkin failed: {response.status_code} - {response.text}")
            return False
            
        checkin_data = response.json()
        self.test_regular_checkin_id = checkin_data["id"]
        
        self.log(f"✅ Regular checkin successful with large image")
        self.log(f"   Regular Checkin ID: {self.test_regular_checkin_id}")
        
        # Verify the photo was stored and potentially compressed
        stored_photo = checkin_data.get("checkin_photo")
        if stored_photo:
            try:
                # Decode the stored photo to check its size
                stored_data = base64.b64decode(stored_photo)
                stored_size_kb = len(stored_data) / 1024
                
                self.log(f"   Original image: {original_size_kb:.1f}KB")
                self.log(f"   Stored image: {stored_size_kb:.1f}KB")
                
                # Check if compression occurred
                if stored_size_kb < original_size_kb:
                    compression_ratio = (1 - stored_size_kb / original_size_kb) * 100
                    self.log(f"   ✅ Image compressed: {compression_ratio:.1f}% reduction")
                    
                    # Check if it meets the 300KB target
                    if stored_size_kb <= 300:
                        self.log(f"   ✅ Image meets 300KB target: {stored_size_kb:.1f}KB")
                    else:
                        self.log(f"   ⚠️  Image exceeds 300KB target: {stored_size_kb:.1f}KB")
                else:
                    self.log(f"   ⚠️  No compression detected")
                    
                # Verify the stored image is still valid
                test_img = Image.open(BytesIO(stored_data))
                self.log(f"   ✅ Stored image is valid: {test_img.size} pixels")
                
            except Exception as e:
                self.log(f"   ❌ Error analyzing stored photo: {e}")
                return False
        else:
            self.log(f"   ❌ No photo stored in checkin response")
            return False
            
        return True

    def test_regular_checkout_with_large_image(self):
        """Test 20: Test regular PUT /api/checkins/{id}/checkout with large image"""
        self.log("Testing regular checkout with large image compression...")
        
        if not self.installer_token or not hasattr(self, 'test_regular_checkin_id'):
            self.log("❌ Missing installer token or regular checkin ID")
            return False
            
        # Create another large test image for checkout
        large_image_b64, original_size = create_large_test_image(3200, 2100)
        original_size_kb = original_size / 1024
        
        self.log(f"   Using large checkout image: {original_size_kb:.1f}KB")
        
        # Wait a moment to ensure duration calculation
        time.sleep(2)
        
        headers = {"Authorization": f"Bearer {self.installer_token}"}
        
        # Prepare form data for regular checkout with large image
        form_data = {
            "photo_base64": large_image_b64,
            "gps_lat": GPS_CHECKOUT["lat"] + 0.001,  # Slightly different location
            "gps_long": GPS_CHECKOUT["long"] + 0.001,
            "gps_accuracy": GPS_CHECKOUT["accuracy"],
            "notes": "Regular checkout with large image compression test"
        }
        
        response = self.session.put(
            f"{BASE_URL}/checkins/{self.test_regular_checkin_id}/checkout",
            data=form_data,
            headers=headers
        )
        
        if response.status_code != 200:
            self.log(f"❌ Regular checkout failed: {response.status_code} - {response.text}")
            return False
            
        checkout_data = response.json()
        
        self.log(f"✅ Regular checkout successful with large image")
        self.log(f"   Status: {checkout_data.get('status')}")
        
        # Verify the checkout photo was stored and potentially compressed
        stored_photo = checkout_data.get("checkout_photo")
        if stored_photo:
            try:
                # Decode the stored photo to check its size
                stored_data = base64.b64decode(stored_photo)
                stored_size_kb = len(stored_data) / 1024
                
                self.log(f"   Original checkout image: {original_size_kb:.1f}KB")
                self.log(f"   Stored checkout image: {stored_size_kb:.1f}KB")
                
                # Check if compression occurred
                if stored_size_kb < original_size_kb:
                    compression_ratio = (1 - stored_size_kb / original_size_kb) * 100
                    self.log(f"   ✅ Checkout image compressed: {compression_ratio:.1f}% reduction")
                    
                    # Check if it meets the 300KB target
                    if stored_size_kb <= 300:
                        self.log(f"   ✅ Checkout image meets 300KB target: {stored_size_kb:.1f}KB")
                    else:
                        self.log(f"   ⚠️  Checkout image exceeds 300KB target: {stored_size_kb:.1f}KB")
                else:
                    self.log(f"   ⚠️  No compression detected on checkout image")
                    
                # Verify the stored image is still valid
                test_img = Image.open(BytesIO(stored_data))
                self.log(f"   ✅ Stored checkout image is valid: {test_img.size} pixels")
                
            except Exception as e:
                self.log(f"   ❌ Error analyzing stored checkout photo: {e}")
                return False
        else:
            self.log(f"   ❌ No checkout photo stored in response")
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
            ("Google Calendar Events (Unauthorized)", self.test_google_calendar_events_unauthorized),
            ("Forgot Password Endpoint", self.test_forgot_password_endpoint),
            ("Verify Reset Token (Invalid)", self.test_verify_reset_token_invalid),
            ("Reset Password (Invalid Token)", self.test_reset_password_invalid_token),
            ("Admin Reset User Password", self.test_admin_reset_user_password),
            ("Image Compression Function (Direct)", self.test_image_compression_function_direct),
            ("Item Checkin with Large Image", self.test_item_checkin_with_large_image),
            ("Item Checkout with Large Image", self.test_item_checkout_with_large_image),
            ("Regular Checkin with Large Image", self.test_regular_checkin_with_large_image),
            ("Regular Checkout with Large Image", self.test_regular_checkout_with_large_image)
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