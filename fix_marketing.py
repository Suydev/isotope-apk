with open('scripts/apply-android-patches.js', 'r') as f:
    content = f.read()

# Fix marketing-core patch - change required from true to false
old = '''], 'marketing-core (anon key alignment)');'''

# Find the marketing-core patch section
idx = content.find('marketing-core (anon key alignment)')
if idx >= 0:
    # Find the closing ], 'marketing-core (anon key alignment)');
    idx2 = content.find("], 'marketing-core (anon key alignment)');", idx)
    if idx2 >= 0:
        print(f'Found at {idx2}')
        # Check what's before it
        print(repr(content[idx2-50:idx2+50]))
    else:
        print('Closing not found')