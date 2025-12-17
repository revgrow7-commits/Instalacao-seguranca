#!/usr/bin/env python3
"""
Google Calendar Integration Test Suite
Tests the Google Calendar endpoints for the Calendar page
"""

import requests
import json
from datetime import datetime

# Test configuration
BASE_URL = "https://instalmonitor.preview.emergentagent.com/api"

# Test credentials
MANAGER_CREDENTIALS = {
    "email": "gerente@industriavisual.com",
    "password": "gerente123"
}

class GoogleCalendarTest:
    def __init__(self):
        self.manager_token = None
        self.session = requests.Session()
        
    def log(self, message):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
        
    def test_manager_login(self):
        """Login as manager"""
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
        
    def test_google_calendar_login_endpoint(self):
        """Test Google Calendar login endpoint - should return authorization URL"""
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
        """Test Google Calendar status endpoint - should return connection status"""
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
        """Test Google Calendar events endpoint - should return 401 when not connected"""
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

    def run_tests(self):
        """Run Google Calendar test suite"""
        self.log("=" * 60)
        self.log("GOOGLE CALENDAR INTEGRATION - BACKEND API TESTS")
        self.log("=" * 60)
        
        tests = [
            ("Manager Login", self.test_manager_login),
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
        self.log("GOOGLE CALENDAR TEST RESULTS SUMMARY")
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
            self.log("\n🎉 ALL GOOGLE CALENDAR TESTS PASSED!")
        else:
            self.log(f"\n⚠️  {failed} GOOGLE CALENDAR TEST(S) FAILED")
            
        return failed == 0

if __name__ == "__main__":
    tester = GoogleCalendarTest()
    success = tester.run_tests()
    exit(0 if success else 1)