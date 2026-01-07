---
name: data-analysis
description: Data analysis with pandas, numpy, and file processing. Use when analyzing CSV files, Excel spreadsheets, JSON data, or performing statistical analysis.
---

# Data Analysis Skills

## Pandas Basics

### Loading Data

```python
import pandas as pd

# CSV
df = pd.read_csv('data.csv')

# Excel
df = pd.read_excel('data.xlsx', sheet_name='Sheet1')

# JSON
df = pd.read_json('data.json')

# From URL
df = pd.read_csv('https://example.com/data.csv')
```

### Data Exploration

```python
# Basic info
df.shape           # (rows, columns)
df.dtypes          # Column types
df.describe()      # Statistical summary
df.head(10)        # First 10 rows
df.info()          # Memory and type info

# Column operations
df.columns         # List columns
df['column']       # Single column
df[['col1', 'col2']]  # Multiple columns
```

### Filtering and Selection

```python
# Conditions
df[df['age'] > 30]
df[(df['age'] > 30) & (df['city'] == 'Paris')]

# Query syntax
df.query('age > 30 and city == "Paris"')

# Loc and iloc
df.loc[df['name'] == 'Alice']   # By label
df.iloc[0:5]                     # By position
```

### Aggregation

```python
# Group by
df.groupby('category').mean()
df.groupby(['cat1', 'cat2']).agg({
    'value': 'sum',
    'count': 'count'
})

# Pivot tables
pd.pivot_table(df, values='sales', index='region', columns='product', aggfunc='sum')
```

## NumPy Operations

```python
import numpy as np

# Statistical operations
np.mean(arr)
np.median(arr)
np.std(arr)
np.percentile(arr, [25, 50, 75])

# Array operations
np.sum(arr)
np.cumsum(arr)
np.diff(arr)
```

## Date/Time Operations

```python
# Parse dates
df['date'] = pd.to_datetime(df['date_string'])

# Extract components
df['year'] = df['date'].dt.year
df['month'] = df['date'].dt.month
df['day_of_week'] = df['date'].dt.dayofweek

# Filter by date
df[df['date'] >= '2020-01-01']

# Resample time series
df.set_index('date').resample('M').mean()  # Monthly average
```

## File Processing

### Reading Different Formats

```python
# Text files
with open('file.txt', 'r') as f:
    content = f.read()
    lines = content.split('\n')

# JSON
import json
with open('data.json', 'r') as f:
    data = json.load(f)

# Binary files
with open('file.bin', 'rb') as f:
    binary_content = f.read()
```

## Best Practices

1. **Always inspect data first**: Use head(), describe(), info()
2. **Handle missing values**: Check for NaN, use fillna() or dropna()
3. **Verify data types**: Convert columns as needed with astype()
4. **Document your analysis**: Comment your code clearly
5. **Validate results**: Cross-check calculations manually when possible
