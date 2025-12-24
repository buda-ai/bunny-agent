# Skill: Data Cleaning

## Purpose
Clean and prepare data for analysis.

## Common Data Issues

### Missing Values
```python
# Check for missing values
df.isnull().sum()

# Fill with mean/median
df['column'] = df['column'].fillna(df['column'].median())

# Drop rows with missing values
df = df.dropna(subset=['important_column'])
```

### Duplicates
```python
# Check for duplicates
df.duplicated().sum()

# Remove duplicates
df = df.drop_duplicates()
```

### Outliers
```python
# IQR method
Q1 = df['column'].quantile(0.25)
Q3 = df['column'].quantile(0.75)
IQR = Q3 - Q1
df = df[(df['column'] >= Q1 - 1.5*IQR) & (df['column'] <= Q3 + 1.5*IQR)]
```

### Data Types
```python
# Convert types
df['date'] = pd.to_datetime(df['date'])
df['value'] = pd.to_numeric(df['value'], errors='coerce')
df['category'] = df['category'].astype('category')
```

### Text Cleaning
```python
# Strip whitespace
df['text'] = df['text'].str.strip()

# Lowercase
df['text'] = df['text'].str.lower()

# Remove special characters
df['text'] = df['text'].str.replace(r'[^\w\s]', '', regex=True)
```

## Validation Checklist
- [ ] All expected columns present
- [ ] Data types are correct
- [ ] No unexpected nulls
- [ ] Values in expected ranges
- [ ] No duplicates (unless expected)
- [ ] Text is normalized
