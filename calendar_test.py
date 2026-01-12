#!/usr/bin/env python3
"""
Calendar Backend Test Suite
Tests calendar-specific functionality for drag-and-drop scheduling
"""

import requests
import json
from datetime import datetime

# Test configuration
BASE_URL = "https://prodtrak.preview.emergentagent.com/api"

# Test credentials
MANAGER_CREDENTIALS = {
    "email": "gerente@industriavisual.com",
    "password": "gerente123"
}

class CalendarAPITest:
    def __init__(self):
        self.manager_token = None
        self.session = requests.Session()
        
    def log(self, message):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
        
    def test_manager_login(self):
        """Test manager login"""
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
        return True

    def test_calendar_job_scheduling_api(self):
        """Test calendar job scheduling API - PUT /api/jobs/{job_id} with scheduled_date"""
        self.log("Testing calendar job scheduling API...")
        
        if not self.manager_token:
            self.log("❌ Missing manager token")
            return False
            
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        
        # Get jobs list
        response = self.session.get(f"{BASE_URL}/jobs", headers=headers)
        
        if response.status_code != 200:
            self.log(f"❌ Could not get jobs list: {response.status_code} - {response.text}")
            return False
            
        jobs = response.json()
        
        if not jobs:
            self.log("❌ No jobs found to schedule")
            return False
            
        # Use first unscheduled job
        test_job = None
        for job in jobs:
            if not job.get('scheduled_date'):
                test_job = job
                break
        
        if not test_job:
            test_job = jobs[0]  # Use any job if all are scheduled
            
        job_id = test_job["id"]
        
        self.log(f"   Testing with job: {test_job.get('title')} (ID: {job_id})")
        
        # Test scheduling a job with PUT /api/jobs/{job_id}
        schedule_data = {
            "scheduled_date": "2024-12-25T10:00:00Z"
        }
        
        response = self.session.put(
            f"{BASE_URL}/jobs/{job_id}",
            json=schedule_data,
            headers=headers
        )
        
        if response.status_code != 200:
            self.log(f"❌ Job scheduling failed: {response.status_code} - {response.text}")
            return False
            
        updated_job = response.json()
        
        self.log(f"✅ Job scheduling API successful")
        self.log(f"   Scheduled date: {updated_job.get('scheduled_date')}")
        
        # Verify scheduled_date was set correctly
        if updated_job.get('scheduled_date'):
            self.log(f"   ✅ Scheduled date field updated successfully")
            return True
        else:
            self.log(f"   ❌ Scheduled date field not set")
            return False

    def test_google_calendar_status_api(self):
        """Test Google Calendar status API - GET /api/auth/google/status"""
        self.log("Testing Google Calendar status API...")
        
        if not self.manager_token:
            self.log("❌ Missing manager token")
            return False
            
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        
        response = self.session.get(
            f"{BASE_URL}/auth/google/status",
            headers=headers
        )
        
        if response.status_code != 200:
            self.log(f"❌ Google Calendar status API failed: {response.status_code} - {response.text}")
            return False
            
        data = response.json()
        
        self.log(f"✅ Google Calendar status API successful")
        
        # Verify response structure for calendar page
        if "connected" in data:
            connected = data["connected"]
            self.log(f"   ✅ Field 'connected' present: {connected}")
            
            # Verify boolean type
            if isinstance(connected, bool):
                self.log(f"   ✅ 'connected' field is boolean: {connected}")
                return True
            else:
                self.log(f"   ❌ 'connected' field should be boolean, got: {type(connected)} - {connected}")
                return False
        else:
            self.log(f"   ❌ Missing 'connected' field")
            return False

    def test_calendar_events_unauthorized_api(self):
        """Test calendar events API returns 401 when user not connected to Google"""
        self.log("Testing calendar events API (unauthorized access)...")
        
        if not self.manager_token:
            self.log("❌ Missing manager token")
            return False
            
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        
        # Test POST /api/calendar/events (create event) - should return 401
        event_data = {
            "title": "Test Calendar Event",
            "description": "Test event for calendar drag-and-drop",
            "start_datetime": "2024-12-25T10:00:00Z",
            "end_datetime": "2024-12-25T11:00:00Z",
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
                error_detail = error_data.get("detail", "")
                if "Google Calendar não conectado" in error_detail:
                    self.log(f"   ✅ Correct error message: {error_detail}")
                    return True
                else:
                    self.log(f"   ⚠️  Unexpected error message: {error_detail}")
                    return True  # Still pass as 401 is correct
            except:
                self.log(f"   ⚠️  Could not parse error response")
                return True  # Still pass as 401 is correct
                
        else:
            self.log(f"❌ Expected 401, got {response.status_code} - {response.text}")
            return False

    def test_unscheduled_jobs_for_calendar(self):
        """Test getting unscheduled jobs for calendar page"""
        self.log("Testing unscheduled jobs for calendar...")
        
        if not self.manager_token:
            self.log("❌ Missing manager token")
            return False
            
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        
        # Get all jobs
        response = self.session.get(f"{BASE_URL}/jobs", headers=headers)
        
        if response.status_code != 200:
            self.log(f"❌ Jobs API failed: {response.status_code} - {response.text}")
            return False
            
        jobs = response.json()
        
        self.log(f"✅ Jobs API successful")
        self.log(f"   Total jobs found: {len(jobs)}")
        
        # Count scheduled vs unscheduled jobs
        scheduled_jobs = [job for job in jobs if job.get('scheduled_date')]
        unscheduled_jobs = [job for job in jobs if not job.get('scheduled_date')]
        
        self.log(f"   Scheduled jobs: {len(scheduled_jobs)}")
        self.log(f"   Unscheduled jobs: {len(unscheduled_jobs)}")
        
        # Verify job structure for calendar display
        if jobs:
            sample_job = jobs[0]
            required_fields = ["id", "title", "client_name", "branch"]
            
            all_fields_present = True
            for field in required_fields:
                if field in sample_job:
                    self.log(f"   ✅ Job has required field '{field}': {sample_job.get(field)}")
                else:
                    self.log(f"   ❌ Job missing required field: {field}")
                    all_fields_present = False
                    
            return all_fields_present
        else:
            self.log("   ⚠️  No jobs found")
            return True  # Not a failure if no jobs exist

    def test_branch_filtering(self):
        """Test branch filtering for calendar jobs"""
        self.log("Testing branch filtering for calendar...")
        
        if not self.manager_token:
            self.log("❌ Missing manager token")
            return False
            
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        
        # Get all jobs
        response = self.session.get(f"{BASE_URL}/jobs", headers=headers)
        
        if response.status_code != 200:
            self.log(f"❌ Jobs API failed: {response.status_code} - {response.text}")
            return False
            
        jobs = response.json()
        
        self.log(f"✅ Jobs API successful for branch filtering")
        
        # Group jobs by branch
        branches = {}
        for job in jobs:
            branch = job.get('branch', 'Unknown')
            if branch not in branches:
                branches[branch] = []
            branches[branch].append(job)
        
        self.log(f"   Branches found: {list(branches.keys())}")
        
        # Verify expected branches exist
        expected_branches = ["POA", "SP"]
        all_branches_found = True
        
        for expected_branch in expected_branches:
            if expected_branch in branches:
                self.log(f"   ✅ Expected branch '{expected_branch}' found with {len(branches[expected_branch])} jobs")
            else:
                self.log(f"   ⚠️  Expected branch '{expected_branch}' not found")
                all_branches_found = False
        
        return all_branches_found

    def run_calendar_tests(self):
        """Run calendar-specific test suite"""
        self.log("=" * 60)
        self.log("CALENDAR BACKEND API TEST SUITE")
        self.log("=" * 60)
        
        tests = [
            ("Manager Login", self.test_manager_login),
            ("Calendar Job Scheduling API", self.test_calendar_job_scheduling_api),
            ("Google Calendar Status API", self.test_google_calendar_status_api),
            ("Calendar Events Unauthorized API", self.test_calendar_events_unauthorized_api),
            ("Unscheduled Jobs for Calendar", self.test_unscheduled_jobs_for_calendar),
            ("Branch Filtering", self.test_branch_filtering)
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
        self.log("CALENDAR TEST RESULTS SUMMARY")
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
            self.log("\n🎉 ALL CALENDAR TESTS PASSED!")
        else:
            self.log(f"\n⚠️  {failed} CALENDAR TEST(S) FAILED")
            
        return failed == 0

if __name__ == "__main__":
    test_runner = CalendarAPITest()
    success = test_runner.run_calendar_tests()
    exit(0 if success else 1)