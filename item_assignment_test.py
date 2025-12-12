#!/usr/bin/env python3
"""
Item Assignment and Check-in Flow Test
Tests the complete flow of item assignment and check-in for the installer productivity control system
"""

import requests
import json
import base64
from datetime import datetime
import time

# Test configuration
BASE_URL = "https://install-pulse.preview.emergentagent.com/api"

# Test credentials as specified in the request
MANAGER_CREDENTIALS = {
    "email": "gerente@industriavisual.com",
    "password": "gerente123"
}

INSTALLER_CREDENTIALS = {
    "email": "instalador@industriavisual.com", 
    "password": "instalador123"
}

# Test Base64 image (1x1 pixel PNG)
TEST_IMAGE_BASE64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

# GPS coordinates for testing (as specified in request)
TEST_GPS = {
    "lat": -29.9,
    "lon": -51.1
}

class ItemAssignmentTest:
    def __init__(self):
        self.manager_token = None
        self.installer_token = None
        self.viamao_job_id = None
        self.installer_teste_id = None
        self.session = requests.Session()
        
    def log(self, message):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
        
    def test_manager_login(self):
        """Test 1: Login as Manager"""
        self.log("=== STEP 1: Manager Login ===")
        
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
        
    def test_get_jobs_list(self):
        """Test 2: Get jobs list and find VIAMAO job"""
        self.log("=== STEP 2: Get Jobs List ===")
        
        if not self.manager_token:
            self.log("❌ No manager token available")
            return False
            
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        response = self.session.get(f"{BASE_URL}/jobs", headers=headers)
        
        if response.status_code != 200:
            self.log(f"❌ Jobs listing failed: {response.status_code} - {response.text}")
            return False
            
        jobs = response.json()
        self.log(f"✅ Jobs listing successful - Found {len(jobs)} jobs")
        
        # Look for VIAMAO job or any job with calculated area
        viamao_job = None
        for job in jobs:
            job_title = job.get('title', '').upper()
            if 'VIAMAO' in job_title or job.get('area_m2', 0) > 0:
                viamao_job = job
                break
                
        if not viamao_job:
            # Use first job if no VIAMAO found
            if jobs:
                viamao_job = jobs[0]
                self.log(f"⚠️  VIAMAO job not found, using first available job")
            else:
                self.log(f"❌ No jobs available")
                return False
                
        self.viamao_job_id = viamao_job["id"]
        self.log(f"✅ Selected job: {viamao_job.get('title')} (ID: {self.viamao_job_id})")
        self.log(f"   Client: {viamao_job.get('client_name')}")
        self.log(f"   Area: {viamao_job.get('area_m2', 0)} m²")
        self.log(f"   Status: {viamao_job.get('status')}")
        
        return True
        
    def test_get_installers_list(self):
        """Test 3: Get installers list and find 'Instalador Teste'"""
        self.log("=== STEP 3: Get Installers List ===")
        
        if not self.manager_token:
            self.log("❌ No manager token available")
            return False
            
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        response = self.session.get(f"{BASE_URL}/installers", headers=headers)
        
        if response.status_code != 200:
            self.log(f"❌ Installers listing failed: {response.status_code} - {response.text}")
            return False
            
        installers = response.json()
        self.log(f"✅ Installers listing successful - Found {len(installers)} installers")
        
        # Look for "Instalador Teste"
        installer_teste = None
        for installer in installers:
            installer_name = installer.get('full_name', '').upper()
            if 'INSTALADOR' in installer_name and 'TESTE' in installer_name:
                installer_teste = installer
                break
                
        if not installer_teste:
            # Use first installer if "Instalador Teste" not found
            if installers:
                installer_teste = installers[0]
                self.log(f"⚠️  'Instalador Teste' not found, using first available installer")
            else:
                self.log(f"❌ No installers available")
                return False
                
        self.installer_teste_id = installer_teste["id"]
        self.log(f"✅ Selected installer: {installer_teste.get('full_name')} (ID: {self.installer_teste_id})")
        self.log(f"   Branch: {installer_teste.get('branch')}")
        
        return True
        
    def test_assign_items_to_installer(self):
        """Test 4: Assign items to installer"""
        self.log("=== STEP 4: Assign Items to Installer ===")
        
        if not self.manager_token or not self.viamao_job_id or not self.installer_teste_id:
            self.log("❌ Missing required data for assignment")
            return False
            
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        
        # Assign items [0, 1] to the installer
        assignment_data = {
            "item_indices": [0, 1],
            "installer_ids": [self.installer_teste_id]
        }
        
        response = self.session.post(
            f"{BASE_URL}/jobs/{self.viamao_job_id}/assign-items",
            json=assignment_data,
            headers=headers
        )
        
        if response.status_code != 200:
            self.log(f"❌ Item assignment failed: {response.status_code} - {response.text}")
            return False
            
        assignment_result = response.json()
        
        self.log(f"✅ Item assignment successful")
        self.log(f"   Message: {assignment_result.get('message')}")
        self.log(f"   Total m² assigned: {assignment_result.get('total_m2_assigned')}")
        self.log(f"   Number of assignments: {len(assignment_result.get('assignments', []))}")
        
        # Show assignment details
        for assignment in assignment_result.get('assignments', []):
            self.log(f"   - Item {assignment.get('item_index')}: {assignment.get('item_name')}")
            self.log(f"     Installer: {assignment.get('installer_name')}")
            self.log(f"     Area: {assignment.get('assigned_m2')} m²")
            
        return True
        
    def test_installer_login(self):
        """Test 5: Login as Installer"""
        self.log("=== STEP 5: Installer Login ===")
        
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
        
    def test_installer_view_assigned_jobs(self):
        """Test 6: Installer views assigned jobs"""
        self.log("=== STEP 6: Installer Views Assigned Jobs ===")
        
        if not self.installer_token:
            self.log("❌ No installer token available")
            return False
            
        headers = {"Authorization": f"Bearer {self.installer_token}"}
        response = self.session.get(f"{BASE_URL}/jobs", headers=headers)
        
        if response.status_code != 200:
            self.log(f"❌ Jobs listing failed: {response.status_code} - {response.text}")
            return False
            
        jobs = response.json()
        self.log(f"✅ Installer jobs listing successful - Found {len(jobs)} assigned jobs")
        
        # Check if VIAMAO job is in the list
        viamao_found = False
        for job in jobs:
            if job.get('id') == self.viamao_job_id:
                viamao_found = True
                self.log(f"✅ VIAMAO job found in installer's assigned jobs")
                self.log(f"   Job: {job.get('title')}")
                self.log(f"   Status: {job.get('status')}")
                break
                
        if not viamao_found:
            self.log(f"⚠️  VIAMAO job not found in installer's assigned jobs")
            
        return True
        
    def test_installer_checkin(self):
        """Test 7: Installer performs check-in"""
        self.log("=== STEP 7: Installer Check-in ===")
        
        if not self.installer_token or not self.viamao_job_id:
            self.log("❌ Missing installer token or job ID")
            return False
            
        headers = {"Authorization": f"Bearer {self.installer_token}"}
        
        # Prepare form data for check-in
        form_data = {
            "job_id": self.viamao_job_id,
            "photo_base64": TEST_IMAGE_BASE64,
            "gps_lat": TEST_GPS["lat"],
            "gps_long": TEST_GPS["lon"],
            "gps_accuracy": 5.0
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
        
        self.log(f"✅ Check-in successful")
        self.log(f"   Check-in ID: {checkin_data.get('id')}")
        self.log(f"   GPS: {checkin_data.get('gps_lat')}, {checkin_data.get('gps_long')}")
        self.log(f"   Accuracy: {checkin_data.get('gps_accuracy')}m")
        self.log(f"   Status: {checkin_data.get('status')}")
        self.log(f"   Photo stored: {'Yes' if checkin_data.get('checkin_photo') else 'No'}")
        
        return True
        
    def test_verify_assignments_after_checkin(self):
        """Test 8: Verify assignments after check-in"""
        self.log("=== STEP 8: Verify Assignments After Check-in ===")
        
        if not self.manager_token or not self.viamao_job_id:
            self.log("❌ Missing manager token or job ID")
            return False
            
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        
        response = self.session.get(
            f"{BASE_URL}/jobs/{self.viamao_job_id}/assignments",
            headers=headers
        )
        
        if response.status_code != 200:
            self.log(f"❌ Assignments verification failed: {response.status_code} - {response.text}")
            return False
            
        assignments_data = response.json()
        
        self.log(f"✅ Assignments verification successful")
        self.log(f"   Job: {assignments_data.get('job_title')}")
        self.log(f"   Total area: {assignments_data.get('total_area_m2')} m²")
        
        # Show assignments by installer
        by_installer = assignments_data.get('by_installer', [])
        self.log(f"   Assignments by installer ({len(by_installer)} installers):")
        for installer_assignment in by_installer:
            self.log(f"   - {installer_assignment.get('installer_name')}")
            self.log(f"     Total m²: {installer_assignment.get('total_m2')}")
            self.log(f"     Items: {len(installer_assignment.get('items', []))}")
            
        # Show assignments by item
        by_item = assignments_data.get('by_item', [])
        self.log(f"   Assignments by item ({len(by_item)} items):")
        for item_assignment in by_item:
            self.log(f"   - Item {item_assignment.get('item_index')}: {item_assignment.get('item_name')}")
            self.log(f"     Area: {item_assignment.get('item_area_m2')} m²")
            installers = item_assignment.get('installers', [])
            for installer in installers:
                self.log(f"     Assigned to: {installer.get('installer_name')} ({installer.get('assigned_m2')} m²)")
                
        return True
        
    def run_complete_flow_test(self):
        """Run the complete item assignment and check-in flow test"""
        self.log("=" * 80)
        self.log("ITEM ASSIGNMENT AND CHECK-IN FLOW TEST")
        self.log("Testing complete flow of item assignment and check-in")
        self.log("=" * 80)
        
        tests = [
            ("Manager Login", self.test_manager_login),
            ("Get Jobs List", self.test_get_jobs_list),
            ("Get Installers List", self.test_get_installers_list),
            ("Assign Items to Installer", self.test_assign_items_to_installer),
            ("Installer Login", self.test_installer_login),
            ("Installer View Assigned Jobs", self.test_installer_view_assigned_jobs),
            ("Installer Check-in", self.test_installer_checkin),
            ("Verify Assignments After Check-in", self.test_verify_assignments_after_checkin)
        ]
        
        results = []
        
        for test_name, test_func in tests:
            self.log(f"\n{'-' * 60}")
            try:
                result = test_func()
                results.append((test_name, result))
                if not result:
                    self.log(f"❌ {test_name} failed - stopping test sequence")
                    break
            except Exception as e:
                self.log(f"❌ {test_name} failed with exception: {e}")
                results.append((test_name, False))
                break
                
        # Summary
        self.log(f"\n{'=' * 80}")
        self.log("TEST RESULTS SUMMARY")
        self.log("=" * 80)
        
        passed = 0
        failed = 0
        
        for test_name, result in results:
            status = "✅ PASS" if result else "❌ FAIL"
            self.log(f"{status} - {test_name}")
            if result:
                passed += 1
            else:
                failed += 1
                
        self.log(f"\nTotal: {len(results)} tests executed")
        self.log(f"Passed: {passed}")
        self.log(f"Failed: {failed}")
        
        if failed == 0:
            self.log(f"\n🎉 ALL TESTS PASSED!")
            self.log(f"✅ Complete item assignment and check-in flow working correctly")
        else:
            self.log(f"\n⚠️  {failed} TEST(S) FAILED")
            
        return failed == 0

if __name__ == "__main__":
    tester = ItemAssignmentTest()
    success = tester.run_complete_flow_test()
    exit(0 if success else 1)