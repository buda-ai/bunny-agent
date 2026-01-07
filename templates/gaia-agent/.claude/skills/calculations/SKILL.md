---
name: calculations
description: Mathematical calculations and computations. Use when performing arithmetic, statistical analysis, financial calculations, or any numerical operations.
---

# Calculations Skills

## Python for Calculations

### Basic Arithmetic

```python
# Use Python for precise calculations
result = 1234567890 * 9876543210  # Large numbers
precise = 1.1 + 2.2 - 3.3         # Float arithmetic

# Rounding
round(3.14159, 2)  # 3.14
```

### Mathematical Operations

```python
import math

# Common functions
math.sqrt(16)       # 4.0
math.pow(2, 10)     # 1024.0
math.log(100, 10)   # 2.0
math.factorial(5)   # 120

# Trigonometry
math.sin(math.pi / 2)
math.cos(0)
```

### Statistical Calculations

```python
import statistics

data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

statistics.mean(data)      # 5.5
statistics.median(data)    # 5.5
statistics.stdev(data)     # Standard deviation
statistics.variance(data)  # Variance
```

## Financial Calculations

### Stock Price Analysis

```python
# Calculate stock split adjustments
# If stock split 4:1 in 2020, prices before 2020 should be divided by 4
pre_split_price = 400
split_ratio = 4
adjusted_price = pre_split_price / split_ratio  # 100

# Compound annual growth rate (CAGR)
def cagr(start_value, end_value, years):
    return (end_value / start_value) ** (1 / years) - 1

# Percentage change
def pct_change(old, new):
    return ((new - old) / old) * 100
```

### Price Thresholds

```python
# Find first date price crossed threshold
import yfinance as yf

ticker = yf.Ticker("AAPL")
history = ticker.history(period="max")

# Find first close above $500
threshold = 500
crossed = history[history['Close'] >= threshold]
if not crossed.empty:
    first_date = crossed.index[0]
    print(f"First crossed ${threshold} on {first_date}")
```

## Unit Conversions

```python
# Common conversions
def celsius_to_fahrenheit(c):
    return c * 9/5 + 32

def miles_to_km(miles):
    return miles * 1.60934

def lbs_to_kg(lbs):
    return lbs * 0.453592
```

## Best Practices

1. **Always use Python for calculations**: Never do mental math for complex operations
2. **Show your work**: Print intermediate results
3. **Verify edge cases**: Check for division by zero, negative numbers, etc.
4. **Use appropriate precision**: Consider significant figures
5. **Document units**: Always specify units in output
