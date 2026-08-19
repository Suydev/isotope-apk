with open('www/assets/useAIStore-DRa7CkEN.js', 'r') as f:
    content = f.read()

# Find the exact fetch pattern for Gemini
idx = content.find('fetch(`')
if idx >= 0:
    print('Gemini fetch:')
    print(content[idx:idx+200])
    print('---')

# Find the Groq fetch
idx = content.find('api.groq.com')
if idx >= 0:
    fetch_idx = content.rfind('fetch', 0, idx)
    if fetch_idx >= 0:
        print('Groq fetch:')
        print(content[fetch_idx:fetch_idx+200])