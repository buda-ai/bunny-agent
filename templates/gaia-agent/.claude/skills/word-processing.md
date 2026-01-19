# Skill: Word Document Processing

## Purpose
Read, extract, and analyze content from Word documents (.docx, .doc) for various tasks.

## Python Libraries

### python-docx (Modern .docx files)
```python
from docx import Document

# Open document
doc = Document('file.docx')

# Extract all text
full_text = []
for para in doc.paragraphs:
    full_text.append(para.text)
text = '\n'.join(full_text)

# Access specific paragraphs
first_para = doc.paragraphs[0].text

# Get paragraph count
para_count = len(doc.paragraphs)
```

### Extract Tables
```python
from docx import Document

doc = Document('file.docx')

# Iterate through tables
for table in doc.tables:
    for row in table.rows:
        cells = [cell.text for cell in row.cells]
        print(cells)

# Extract specific table
if len(doc.tables) > 0:
    table = doc.tables[0]
    data = [[cell.text for cell in row.cells] for row in table.rows]
```

### Extract Headers and Styles
```python
from docx import Document

doc = Document('file.docx')

# Find headers
headers = []
for para in doc.paragraphs:
    if para.style.name.startswith('Heading'):
        headers.append((para.style.name, para.text))

# Check text formatting
for para in doc.paragraphs:
    for run in para.runs:
        if run.bold:
            print(f"Bold text: {run.text}")
        if run.italic:
            print(f"Italic text: {run.text}")
```

### docx2txt (Simple Text Extraction)
```python
import docx2txt

# Extract text (faster, simpler)
text = docx2txt.process('file.docx')

# Extract with images
text = docx2txt.process('file.docx', 'output_image_folder/')
```

## Common Tasks

### Search for Specific Text
```python
from docx import Document

doc = Document('file.docx')

# Search in paragraphs
keyword = "important"
results = []
for i, para in enumerate(doc.paragraphs):
    if keyword.lower() in para.text.lower():
        results.append((i, para.text))

print(f"Found {len(results)} matches")
```

### Extract Lists
```python
from docx import Document

doc = Document('file.docx')

# Find list items
lists = []
for para in doc.paragraphs:
    # Check if paragraph has list format
    if para.style.name.startswith('List'):
        lists.append(para.text)
```

### Count Words and Characters
```python
from docx import Document

doc = Document('file.docx')

# Extract all text
text = '\n'.join([para.text for para in doc.paragraphs])

# Count
word_count = len(text.split())
char_count = len(text)
para_count = len(doc.paragraphs)

print(f"Words: {word_count}, Characters: {char_count}, Paragraphs: {para_count}")
```

### Extract Metadata
```python
from docx import Document

doc = Document('file.docx')

# Core properties
core_props = doc.core_properties
print(f"Author: {core_props.author}")
print(f"Title: {core_props.title}")
print(f"Created: {core_props.created}")
print(f"Modified: {core_props.modified}")
```

### Convert to Plain Text with Formatting
```python
from docx import Document

doc = Document('file.docx')

# Preserve basic structure
output = []
for para in doc.paragraphs:
    # Add heading markers
    if para.style.name.startswith('Heading'):
        level = para.style.name[-1]
        output.append('#' * int(level) + ' ' + para.text)
    else:
        output.append(para.text)
    output.append('')  # Add blank line

text = '\n'.join(output)
```

## Legacy .doc Files

### Using antiword (Linux/Mac)
```python
import subprocess

# Convert .doc to text
result = subprocess.run(
    ['antiword', 'file.doc'],
    capture_output=True,
    text=True
)
text = result.stdout

# Install: brew install antiword (Mac) or apt-get install antiword (Linux)
```

### Using textract
```python
import textract

# Works with .doc and .docx
text = textract.process('file.doc').decode('utf-8')

# Install: pip install textract
```

## Troubleshooting

### Installation
```bash
# Install python-docx
pip install python-docx

# Install docx2txt (simpler extraction)
pip install docx2txt

# For legacy .doc files
pip install textract
# Or use antiword (system package)
```

### File Encoding Issues
```python
from docx import Document

try:
    doc = Document('file.docx')
    text = '\n'.join([para.text for para in doc.paragraphs])
except Exception as e:
    print(f"Error reading document: {e}")
    # Try alternative method
    import docx2txt
    text = docx2txt.process('file.docx')
```

### Corrupted Files
```python
from docx import Document

try:
    doc = Document('file.docx')
except Exception as e:
    print(f"File may be corrupted: {e}")
    # Try repair or alternative extraction
```

## Best Practices
1. Check file existence before processing
2. Handle exceptions for corrupted documents
3. Use docx2txt for simple text extraction (faster)
4. Use python-docx for structured content (tables, formatting)
5. For .doc files, consider converting to .docx first
6. Always validate extracted data structure
7. Handle empty paragraphs and tables gracefully
