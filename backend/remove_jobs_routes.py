"""
Script to safely remove jobs routes from server.py
"""
import re

# Read the file
with open('/app/backend/server.py', 'r') as f:
    lines = f.readlines()

print(f"Original file has {len(lines)} lines")

# Define sections to remove
sections_to_remove = []

i = 0
while i < len(lines):
    line = lines[i]
    
    # HOLDPRINT & JOB ROUTES section
    if '# ============ HOLDPRINT & JOB ROUTES ============' in line:
        start = i
        # Find the end - before CHECK-IN/OUT ROUTES comment
        j = i + 1
        while j < len(lines):
            if '# ============ CHECK-IN/OUT ROUTES ============' in lines[j]:
                break
            j += 1
        sections_to_remove.append((start, j - 1, 'HOLDPRINT & JOB ROUTES'))
        i = j
        continue
    
    # INSTALLER ROUTES section (small, keep for now as it's related)
    # Actually we need to check if installers are in their own module
    
    # JOB JUSTIFICATION section
    if '# ==================== JOB JUSTIFICATION ====================' in line:
        start = i
        # Find the end - before GAMIFICATION & BONUS SYSTEM
        j = i + 1
        while j < len(lines):
            if '# ============ GAMIFICATION & BONUS SYSTEM ============' in lines[j]:
                break
            j += 1
        sections_to_remove.append((start, j - 1, 'JOB JUSTIFICATION'))
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
