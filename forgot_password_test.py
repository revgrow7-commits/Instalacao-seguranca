#!/usr/bin/env python3
"""
Focused test for Forgot Password functionality
Tests all 4 scenarios from the review request
"""

import requests
import json
from datetime import datetime

# Test configuration
BASE_URL = "https://instalmonitor.preview.emergentagent.com/api"

# Test credentials
ADMIN_CREDENTIALS = {
    "email": "admin@industriavisual.com", 
    "password": "admin123"
}

class ForgotPasswordTest:
    def __init__(self):
        self.admin_token = None
        self.session = requests.Session()
        
    def log(self, message):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
        
    def test_admin_login(self):
        """Login as admin for user management tests"""
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
        return True
        
    def test_scenario_1_forgot_password_success(self):
        """Test Scenario 1: POST /api/auth/forgot-password with valid email"""
        self.log("=== SCENARIO 1: Forgot Password with Valid Email ===")
        
        forgot_data = {
            "email": "revgrow7@gmail.com"
        }
        
        response = self.session.post(
            f"{BASE_URL}/auth/forgot-password",
            json=forgot_data
        )
        
        self.log(f"Request: POST {BASE_URL}/auth/forgot-password")
        self.log(f"Body: {json.dumps(forgot_data)}")
        self.log(f"Response Status: {response.status_code}")
        
        if response.status_code != 200:
            self.log(f"❌ FAILED: Expected 200, got {response.status_code}")
            self.log(f"Response: {response.text}")
            return False
            
        try:
            data = response.json()
            self.log(f"Response Body: {json.dumps(data, indent=2)}")
        except:
            self.log(f"Response Body (raw): {response.text}")
            return False
            
        # Verify response contains success message
        if "message" in data:
            message = data["message"]
            if "receberá um link" in message.lower() or "redefinir" in message.lower():
                self.log(f"✅ SUCCESS: Appropriate success message returned")
                return True
            else:
                self.log(f"❌ FAILED: Unexpected message format: {message}")
                return False
        else:
            self.log(f"❌ FAILED: No message field in response")
            return False
            
    def test_scenario_2_verify_invalid_token(self):
        """Test Scenario 2: GET /api/auth/verify-reset-token with invalid token"""
        self.log("=== SCENARIO 2: Verify Invalid Reset Token ===")
        
        invalid_token = "invalid"
        url = f"{BASE_URL}/auth/verify-reset-token?token={invalid_token}"
        
        response = self.session.get(url)
        
        self.log(f"Request: GET {url}")
        self.log(f"Response Status: {response.status_code}")
        
        if response.status_code != 200:
            self.log(f"❌ FAILED: Expected 200, got {response.status_code}")
            self.log(f"Response: {response.text}")
            return False
            
        try:
            data = response.json()
            self.log(f"Response Body: {json.dumps(data, indent=2)}")
        except:
            self.log(f"Response Body (raw): {response.text}")
            return False
            
        # Verify response structure
        if "valid" in data and data["valid"] == False:
            self.log(f"✅ SUCCESS: Invalid token correctly returns valid: false")
            return True
        else:
            self.log(f"❌ FAILED: Expected valid: false, got: {data}")
            return False
            
    def test_scenario_3_reset_password_invalid_token(self):
        """Test Scenario 3: POST /api/auth/reset-password with invalid token"""
        self.log("=== SCENARIO 3: Reset Password with Invalid Token ===")
        
        reset_data = {
            "token": "invalid",
            "new_password": "newpassword123"
        }
        
        response = self.session.post(
            f"{BASE_URL}/auth/reset-password",
            json=reset_data
        )
        
        self.log(f"Request: POST {BASE_URL}/auth/reset-password")
        self.log(f"Body: {json.dumps(reset_data)}")
        self.log(f"Response Status: {response.status_code}")
        
        if response.status_code != 400:
            self.log(f"❌ FAILED: Expected 400, got {response.status_code}")
            self.log(f"Response: {response.text}")
            return False
            
        try:
            data = response.json()
            self.log(f"Response Body: {json.dumps(data, indent=2)}")
        except:
            self.log(f"Response Body (raw): {response.text}")
            return False
            
        # Verify error message
        if "detail" in data:
            error_message = data["detail"]
            if "inválido" in error_message.lower() or "expirado" in error_message.lower():
                self.log(f"✅ SUCCESS: Appropriate error message for invalid token")
                return True
            else:
                self.log(f"❌ FAILED: Unexpected error message: {error_message}")
                return False
        else:
            self.log(f"❌ FAILED: No detail field in error response")
            return False
            
    def test_scenario_4_admin_reset_user_password(self):
        """Test Scenario 4: PUT /api/users/{user_id}/reset-password (admin function)"""
        self.log("=== SCENARIO 4: Admin Reset User Password ===")
        
        if not self.admin_token:
            self.log("❌ FAILED: No admin token available")
            return False
            
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # First get list of users to find a target user
        response = self.session.get(f"{BASE_URL}/users", headers=headers)
        
        if response.status_code != 200:
            self.log(f"❌ FAILED: Could not get users list: {response.status_code}")
            return False
            
        users = response.json()
        self.log(f"Found {len(users)} users in system")
        
        # Find a non-admin user
        target_user = None
        for user in users:
            if user.get("role") != "admin":
                target_user = user
                break
                
        if not target_user:
            self.log(f"❌ FAILED: No non-admin user found")
            return False
            
        user_id = target_user["id"]
        user_name = target_user.get("name", "Unknown")
        user_email = target_user.get("email", "Unknown")
        
        self.log(f"Target user: {user_name} ({user_email}) - ID: {user_id}")
        
        # Test admin reset password
        reset_data = {
            "new_password": "admin_reset_test_123"
        }
        
        url = f"{BASE_URL}/users/{user_id}/reset-password"
        response = self.session.put(url, json=reset_data, headers=headers)
        
        self.log(f"Request: PUT {url}")
        self.log(f"Body: {json.dumps(reset_data)}")
        self.log(f"Response Status: {response.status_code}")
        
        if response.status_code != 200:
            self.log(f"❌ FAILED: Expected 200, got {response.status_code}")
            self.log(f"Response: {response.text}")
            return False
            
        try:
            data = response.json()
            self.log(f"Response Body: {json.dumps(data, indent=2)}")
        except:
            self.log(f"Response Body (raw): {response.text}")
            return False
            
        # Verify success message
        if "message" in data:
            message = data["message"]
            if user_name in message and "redefinida" in message.lower():
                self.log(f"✅ SUCCESS: Admin password reset successful")
                return True
            else:
                self.log(f"❌ FAILED: Unexpected success message: {message}")
                return False
        else:
            self.log(f"❌ FAILED: No message in response")
            return False

    def run_all_tests(self):
        """Run all forgot password test scenarios"""
        self.log("=" * 70)
        self.log("FORGOT PASSWORD FUNCTIONALITY TEST")
        self.log("=" * 70)
        
        # Login as admin first
        if not self.test_admin_login():
            self.log("❌ Cannot proceed without admin login")
            return False
            
        tests = [
            ("Scenario 1: Forgot Password Success", self.test_scenario_1_forgot_password_success),
            ("Scenario 2: Verify Invalid Token", self.test_scenario_2_verify_invalid_token),
            ("Scenario 3: Reset Password Invalid Token", self.test_scenario_3_reset_password_invalid_token),
            ("Scenario 4: Admin Reset User Password", self.test_scenario_4_admin_reset_user_password)
        ]
        
        results = []
        
        for test_name, test_func in tests:
            self.log(f"\n{'-' * 50}")
            try:
                result = test_func()
                results.append((test_name, result))
            except Exception as e:
                self.log(f"❌ Test failed with exception: {e}")
                results.append((test_name, False))
                
        # Summary
        self.log(f"\n{'=' * 70}")
        self.log("TEST RESULTS SUMMARY")
        self.log("=" * 70)
        
        passed = 0
        failed = 0
        
        for test_name, result in results:
            status = "✅ PASS" if result else "❌ FAIL"
            self.log(f"{status} - {test_name}")
            if result:
                passed += 1
            else:
                failed += 1
                
        self.log(f"\nTotal: {len(results)} scenarios")
        self.log(f"Passed: {passed}")
        self.log(f"Failed: {failed}")
        
        if failed == 0:
            self.log("\n🎉 ALL FORGOT PASSWORD TESTS PASSED!")
        else:
            self.log(f"\n⚠️  {failed} TEST(S) FAILED")
            
        return failed == 0

if __name__ == "__main__":
    tester = ForgotPasswordTest()
    success = tester.run_all_tests()
    exit(0 if success else 1)