#!/usr/bin/env python3
"""
Focused Holdprint API Integration Test
Tests the specific scenarios requested in the review
"""

import requests
import json
from datetime import datetime

# Test configuration
BASE_URL = "https://prod-control-10.preview.emergentagent.com/api"

# Test credentials
ADMIN_CREDENTIALS = {
    "email": "admin@industriavisual.com", 
    "password": "admin123"
}

MANAGER_CREDENTIALS = {
    "email": "gerente@industriavisual.com",
    "password": "gerente123"
}

class HoldprintAPITest:
    def __init__(self):
        self.admin_token = None
        self.manager_token = None
        self.session = requests.Session()
        
    def log(self, message):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
        
    def test_admin_login(self):
        """Login as admin"""
        self.log("Testing admin login...")
        
        response = self.session.post(
            f"{BASE_URL}/auth/login",
            json=ADMIN_CREDENTIALS
        )
        
        if response.status_code != 200:
            self.log(f"❌ Admin login failed: {response.status_code} - {response.text}")
            return False
            
        data = response.json()
        self.admin_token = data["access_token"]
        user_info = data.get("user", {})
        
        self.log(f"✅ Admin login successful")
        self.log(f"   User: {user_info.get('name')} ({user_info.get('email')})")
        return True
        
    def test_holdprint_fetch_poa_jobs(self):
        """Test: Fetch POA jobs from Holdprint API"""
        self.log("Testing Holdprint API - Fetch POA jobs...")
        
        if not self.admin_token:
            self.log("❌ Missing admin token")
            return False
            
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        response = self.session.get(
            f"{BASE_URL}/holdprint/jobs/POA",
            headers=headers
        )
        
        if response.status_code != 200:
            self.log(f"❌ Holdprint POA jobs fetch failed: {response.status_code} - {response.text}")
            return False
            
        data = response.json()
        
        self.log(f"✅ Holdprint POA jobs fetch successful")
        
        # Verify response structure
        if "success" in data and "jobs" in data:
            success = data["success"]
            jobs = data["jobs"]
            
            self.log(f"   Success: {success}")
            self.log(f"   Jobs found: {len(jobs)}")
            
            if jobs:
                # Verify job structure
                first_job = jobs[0]
                required_fields = ["id", "title", "customerName"]
                
                for field in required_fields:
                    if field in first_job:
                        self.log(f"   ✅ Job has required field '{field}': {first_job.get(field)}")
                    else:
                        self.log(f"   ❌ Job missing required field: {field}")
                        return False
                        
                # Check for production status if available
                if "production" in first_job and "status" in first_job["production"]:
                    self.log(f"   ✅ Production status available: {first_job['production']['status']}")
                else:
                    self.log(f"   ⚠️  Production status not found in job structure")
                    
                # Show sample job data
                self.log(f"   Sample job: {first_job.get('title')} - {first_job.get('customerName')}")
                    
            else:
                self.log(f"   ⚠️  No jobs returned from POA branch")
                
        else:
            self.log(f"   ❌ Invalid response structure: {data}")
            return False
            
        return True

    def test_holdprint_fetch_sp_jobs(self):
        """Test: Fetch SP jobs from Holdprint API"""
        self.log("Testing Holdprint API - Fetch SP jobs...")
        
        if not self.admin_token:
            self.log("❌ Missing admin token")
            return False
            
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        response = self.session.get(
            f"{BASE_URL}/holdprint/jobs/SP",
            headers=headers
        )
        
        if response.status_code != 200:
            self.log(f"❌ Holdprint SP jobs fetch failed: {response.status_code} - {response.text}")
            return False
            
        data = response.json()
        
        self.log(f"✅ Holdprint SP jobs fetch successful")
        
        # Verify response structure
        if "success" in data and "jobs" in data:
            success = data["success"]
            jobs = data["jobs"]
            
            self.log(f"   Success: {success}")
            self.log(f"   Jobs found: {len(jobs)}")
            
            if jobs:
                # Verify job structure
                first_job = jobs[0]
                required_fields = ["id", "title", "customerName"]
                
                for field in required_fields:
                    if field in first_job:
                        self.log(f"   ✅ Job has required field '{field}': {first_job.get(field)}")
                    else:
                        self.log(f"   ❌ Job missing required field: {field}")
                        return False
                        
                # Check for production status if available
                if "production" in first_job and "status" in first_job["production"]:
                    self.log(f"   ✅ Production status available: {first_job['production']['status']}")
                else:
                    self.log(f"   ⚠️  Production status not found in job structure")
                    
                # Show sample job data
                self.log(f"   Sample job: {first_job.get('title')} - {first_job.get('customerName')}")
                    
            else:
                self.log(f"   ⚠️  No jobs returned from SP branch")
                
        else:
            self.log(f"   ❌ Invalid response structure: {data}")
            return False
            
        return True

    def test_holdprint_batch_import_poa(self):
        """Test: Batch import POA jobs from Holdprint"""
        self.log("Testing Holdprint API - Batch import POA jobs...")
        
        if not self.admin_token:
            self.log("❌ Missing admin token")
            return False
            
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        import_data = {
            "branch": "POA"
        }
        
        response = self.session.post(
            f"{BASE_URL}/jobs/import-all",
            json=import_data,
            headers=headers
        )
        
        if response.status_code != 200:
            self.log(f"❌ Holdprint POA batch import failed: {response.status_code} - {response.text}")
            return False
            
        data = response.json()
        
        self.log(f"✅ Holdprint POA batch import successful")
        
        # Verify response structure
        expected_fields = ["success", "imported", "skipped", "total"]
        for field in expected_fields:
            if field in data:
                self.log(f"   ✅ {field}: {data[field]}")
            else:
                self.log(f"   ❌ Missing field in response: {field}")
                return False
                
        # Check for errors
        if "errors" in data:
            errors = data["errors"]
            if errors:
                self.log(f"   ⚠️  Import errors: {len(errors)}")
                for error in errors[:3]:  # Show first 3 errors
                    self.log(f"      - {error}")
            else:
                self.log(f"   ✅ No import errors")
                
        # Verify import results make sense
        imported = data.get("imported", 0)
        skipped = data.get("skipped", 0)
        total = data.get("total", 0)
        
        if imported + skipped == total:
            self.log(f"   ✅ Import counts are consistent: {imported} imported + {skipped} skipped = {total} total")
        else:
            self.log(f"   ⚠️  Import counts inconsistent: {imported} + {skipped} ≠ {total}")
            
        return True

    def test_holdprint_batch_import_sp(self):
        """Test: Batch import SP jobs from Holdprint"""
        self.log("Testing Holdprint API - Batch import SP jobs...")
        
        if not self.admin_token:
            self.log("❌ Missing admin token")
            return False
            
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        import_data = {
            "branch": "SP"
        }
        
        response = self.session.post(
            f"{BASE_URL}/jobs/import-all",
            json=import_data,
            headers=headers
        )
        
        if response.status_code != 200:
            self.log(f"❌ Holdprint SP batch import failed: {response.status_code} - {response.text}")
            return False
            
        data = response.json()
        
        self.log(f"✅ Holdprint SP batch import successful")
        
        # Verify response structure
        expected_fields = ["success", "imported", "skipped", "total"]
        for field in expected_fields:
            if field in data:
                self.log(f"   ✅ {field}: {data[field]}")
            else:
                self.log(f"   ❌ Missing field in response: {field}")
                return False
                
        # Check for errors
        if "errors" in data:
            errors = data["errors"]
            if errors:
                self.log(f"   ⚠️  Import errors: {len(errors)}")
                for error in errors[:3]:  # Show first 3 errors
                    self.log(f"      - {error}")
            else:
                self.log(f"   ✅ No import errors")
                
        # Verify import results make sense
        imported = data.get("imported", 0)
        skipped = data.get("skipped", 0)
        total = data.get("total", 0)
        
        if imported + skipped == total:
            self.log(f"   ✅ Import counts are consistent: {imported} imported + {skipped} skipped = {total} total")
        else:
            self.log(f"   ⚠️  Import counts inconsistent: {imported} + {skipped} ≠ {total}")
            
        return True

    def run_holdprint_tests(self):
        """Run Holdprint API integration tests"""
        self.log("=" * 60)
        self.log("HOLDPRINT API INTEGRATION TEST SUITE")
        self.log("=" * 60)
        
        tests = [
            ("Admin Login", self.test_admin_login),
            ("Holdprint Fetch POA Jobs", self.test_holdprint_fetch_poa_jobs),
            ("Holdprint Fetch SP Jobs", self.test_holdprint_fetch_sp_jobs),
            ("Holdprint Batch Import POA", self.test_holdprint_batch_import_poa),
            ("Holdprint Batch Import SP", self.test_holdprint_batch_import_sp)
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
        self.log("HOLDPRINT API TEST RESULTS SUMMARY")
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
            self.log("\n🎉 ALL HOLDPRINT API TESTS PASSED!")
        else:
            self.log(f"\n⚠️  {failed} HOLDPRINT API TEST(S) FAILED")
            
        return failed == 0

if __name__ == "__main__":
    tester = HoldprintAPITest()
    success = tester.run_holdprint_tests()
    exit(0 if success else 1)