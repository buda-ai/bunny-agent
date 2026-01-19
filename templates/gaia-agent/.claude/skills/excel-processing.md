# Skill: Excel File Processing

## Purpose
Read, analyze, and extract data from Excel files (.xlsx, .xls) for various tasks.

## Python Libraries

### openpyxl (Modern .xlsx files)
```python
import openpyxl

# Read workbook
wb = openpyxl.load_workbook('file.xlsx')
sheet = wb.active  # or wb['SheetName']

# Iterate through rows
for row in sheet.iter_rows(min_row=2, values_only=True):
    print(row)

# Access specific cells
value = sheet['A1'].value
value = sheet.cell(row=1, column=1).value

# Get all data as list
data = [[cell.value for cell in row] for row in sheet.rows]
```

### pandas (Data Analysis)
```python
import pandas as pd

# Read Excel file
df = pd.read_excel('file.xlsx', sheet_name='Sheet1')

# Read multiple sheets
dfs = pd.read_excel('file.xlsx', sheet_name=None)  # Returns dict

# Skip rows, use specific columns
df = pd.read_excel('file.xlsx', skiprows=2, usecols='A:D')

# Basic operations
print(df.head())
print(df.describe())
print(df.columns.tolist())

# Filter and aggregate
filtered = df[df['column'] > 100]
grouped = df.groupby('category').sum()
```

### xlrd (Legacy .xls files)
```python
import xlrd

# Read workbook
wb = xlrd.open_workbook('file.xls')
sheet = wb.sheet_by_index(0)

# Read cell values
value = sheet.cell_value(row=0, col=0)

# Iterate rows
for row_idx in range(sheet.nrows):
    row = [sheet.cell_value(row_idx, col_idx) for col_idx in range(sheet.ncols)]
    print(row)
```

## Common Tasks

### Extract Specific Data
```python
import pandas as pd

# Read and filter
df = pd.read_excel('data.xlsx')
result = df[df['Status'] == 'Active']['Name'].tolist()
```

### Handle Multiple Sheets
```python
# Read all sheets
excel_file = pd.ExcelFile('workbook.xlsx')
for sheet_name in excel_file.sheet_names:
    df = pd.read_excel(excel_file, sheet_name=sheet_name)
    print(f"Sheet: {sheet_name}")
    print(df.head())
```

### Calculate Statistics
```python
df = pd.read_excel('numbers.xlsx')

# Sum, mean, count
total = df['Amount'].sum()
average = df['Amount'].mean()
count = df['Amount'].count()

# Group by category
summary = df.groupby('Category').agg({
    'Amount': ['sum', 'mean', 'count']
})
```

### Extract Formulas (openpyxl)
```python
import openpyxl

wb = openpyxl.load_workbook('file.xlsx')
sheet = wb.active

# Get cell with formula
cell = sheet['A1']
print(f"Value: {cell.value}")
print(f"Formula: {cell.value if isinstance(cell, str) and cell.startswith('=') else 'No formula'}")

# For data_only mode
wb_data = openpyxl.load_workbook('file.xlsx', data_only=True)
calculated_value = wb_data.active['A1'].value
```

## Troubleshooting

### File Format Issues
```bash
# Install required packages
pip install openpyxl pandas xlrd

# For .xls files, install xlrd
pip install xlrd==1.2.0
```

### Memory Issues (Large Files)
```python
# Read in chunks
chunk_size = 1000
for chunk in pd.read_excel('large.xlsx', chunksize=chunk_size):
    process(chunk)

# Or use openpyxl with read_only mode
wb = openpyxl.load_workbook('large.xlsx', read_only=True)
```

### Date Formatting
```python
df = pd.read_excel('file.xlsx')
df['date'] = pd.to_datetime(df['date'])
```

## Best Practices
1. Always check file existence before processing
2. Handle exceptions for corrupted files
3. Use `sheet_name=None` to explore unknown structures
4. Prefer pandas for data analysis tasks
5. Use openpyxl for cell-level formatting details
6. Close files properly or use context managers
