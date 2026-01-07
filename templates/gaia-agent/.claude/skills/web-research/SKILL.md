---
name: web-research
description: Web research, HTTP requests, and API interaction. Use when fetching web pages, calling APIs, or scraping data from the internet.
---

# Web Research Skills

## HTTP Requests

### Basic GET Request

```python
import requests

response = requests.get('https://api.example.com/data')
data = response.json()
```

### With Headers and Parameters

```python
headers = {
    'User-Agent': 'Mozilla/5.0',
    'Accept': 'application/json'
}
params = {
    'q': 'search query',
    'limit': 10
}
response = requests.get(url, headers=headers, params=params)
```

### POST Request

```python
data = {'key': 'value'}
response = requests.post(url, json=data)
```

### Using curl

```bash
# Simple GET
curl -s "https://api.example.com/data"

# With headers
curl -s -H "Authorization: Bearer TOKEN" "https://api.example.com/data"

# POST with JSON
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"key": "value"}' "https://api.example.com/data"
```

## Web Scraping

### BeautifulSoup

```python
from bs4 import BeautifulSoup
import requests

response = requests.get('https://example.com')
soup = BeautifulSoup(response.content, 'html.parser')

# Find elements
title = soup.find('title').text
links = soup.find_all('a')
divs = soup.select('div.classname')

# Extract data
for link in links:
    href = link.get('href')
    text = link.text
```

## API Usage

### REST APIs

```python
# Common patterns
BASE_URL = 'https://api.example.com/v1'

# List resources
response = requests.get(f'{BASE_URL}/users')

# Get single resource
response = requests.get(f'{BASE_URL}/users/123')

# Search
response = requests.get(f'{BASE_URL}/search', params={'q': 'query'})
```

### Financial Data APIs

```python
# Yahoo Finance (yfinance)
import yfinance as yf

ticker = yf.Ticker("AAPL")
history = ticker.history(period="10y")  # 10 years of data
info = ticker.info  # Company information

# Get historical prices
df = ticker.history(start="2000-01-01", end="2024-01-01")
print(df[['Open', 'High', 'Low', 'Close', 'Volume']])
```

## Best Practices

1. **Respect rate limits**: Add delays between requests
2. **Handle errors gracefully**: Use try/except blocks
3. **Use appropriate User-Agent**: Some sites block default requests
4. **Cache responses**: Avoid redundant requests
5. **Verify data**: Cross-reference important facts
