"""
Script to safely remove migrated routes from server.py
"""
import re

# Read the file
with open('/app/backend/server.py', 'r') as f:
    lines = f.readlines()

print(f"Original file has {len(lines)} lines")

# Define line ranges to remove (1-indexed)
# Based on analysis:
# - Product Families & Productivity Models: lines 463-543 (models only, keep for now)
# - Product Families Endpoints: lines 2381-2455
# - Products Installed Endpoints: lines 2455-2670
# - Google Calendar Integration: lines 2681-2953
# - Push Notifications: lines 3128-3412

# But we need to be careful with Job Justification (2955-3126) - that should stay

# Let's identify exactly what to remove by looking at content
sections_to_remove = []

i = 0
while i < len(lines):
    line = lines[i]
    
    # Product Families Endpoints (start)
    if '# ============ PRODUCT FAMILIES ENDPOINTS ============' in line:
        start = i
        # Find the end - before Products Installed Endpoints
        j = i + 1
        while j < len(lines):
            if '# ============ PRODUCTS INSTALLED ENDPOINTS ============' in lines[j]:
                break
            j += 1
        sections_to_remove.append((start, j - 1, 'PRODUCT FAMILIES ENDPOINTS'))
        i = j
        continue
    
    # Products Installed Endpoints
    if '# ============ PRODUCTS INSTALLED ENDPOINTS ============' in line:
        start = i
        # Find the end - before "REPORTS ROUTES REMOVED" comment or Google Calendar
        j = i + 1
        while j < len(lines):
            if '# === REPORTS ROUTES REMOVED' in lines[j] or '# ============ GOOGLE CALENDAR INTEGRATION ============' in lines[j]:
                break
            j += 1
        sections_to_remove.append((start, j - 1, 'PRODUCTS INSTALLED ENDPOINTS'))
        i = j
        continue
    
    # Google Calendar Integration
    if '# ============ GOOGLE CALENDAR INTEGRATION ============' in line:
        start = i
        # Find end - before Job Justification
        j = i + 1
        while j < len(lines):
            if '# ==================== JOB JUSTIFICATION ====================' in lines[j]:
                break
            j += 1
        sections_to_remove.append((start, j - 1, 'GOOGLE CALENDAR INTEGRATION'))
        i = j
        continue
    
    # Push Notifications
    if '# ==================== PUSH NOTIFICATIONS ====================' in line:
        start = i
        # Find end - before Gamification & Bonus System
        j = i + 1
        while j < len(lines):
            if '# ============ GAMIFICATION & BONUS SYSTEM ============' in lines[j]:
                break
            j += 1
        sections_to_remove.append((start, j - 1, 'PUSH NOTIFICATIONS'))
        i = j
        continue
    
    i += 1

# Print what we found
print("\nSections to remove:")
for start, end, name in sections_to_remove:
    print(f"  {name}: lines {start+1}-{end+1} ({end - start + 1} lines)")

# Create set of lines to remove
lines_to_remove = set()
for start, end, name in sections_to_remove:
    for i in range(start, end + 1):
        lines_to_remove.add(i)

# Filter out the lines to remove
new_lines = [line for i, line in enumerate(lines) if i not in lines_to_remove]

print(f"\nNew file will have {len(new_lines)} lines (removed {len(lines_to_remove)} lines)")

# Write the new file
with open('/app/backend/server.py', 'w') as f:
    f.writelines(new_lines)

print("File updated successfully!")
