#!/bin/bash
# Generate Dockerfile with optional template files

TEMPLATE="${1:-}"
TEMPLATES_DIR="${2:-../../templates}"
INCLUDE_TEMPLATE="${3:-false}"

DOCKERFILE_TEMPLATE="Dockerfile.template"
OUTPUT_DOCKERFILE="Dockerfile"

# Check if template exists
if [ ! -f "$DOCKERFILE_TEMPLATE" ]; then
  echo "❌ Error: $DOCKERFILE_TEMPLATE not found"
  exit 1
fi

TEMPLATE_FILES=""

if [ "$INCLUDE_TEMPLATE" = "true" ] && [ -n "$TEMPLATE" ]; then
  TEMPLATE_PATH="$TEMPLATES_DIR/$TEMPLATE"
  BUILD_CONTEXT_TEMPLATE=".build-context/templates/$TEMPLATE"
  
  if [ ! -d "$TEMPLATE_PATH" ]; then
    echo "❌ Error: Template directory not found: $TEMPLATE_PATH"
    echo "Available templates:"
    ls -d "$TEMPLATES_DIR"/*/ 2>/dev/null | sed 's|.*/||' | sed 's|/$||' || echo "  (none found)"
    exit 1
  fi
  
  # Clean old build context
  rm -rf .build-context
  
  # Prepare template files in build context
  mkdir -p "$BUILD_CONTEXT_TEMPLATE"
  
  # Copy only .claude/ and CLAUDE.md to build context
  if [ -f "$TEMPLATE_PATH/CLAUDE.md" ]; then
    cp "$TEMPLATE_PATH/CLAUDE.md" "$BUILD_CONTEXT_TEMPLATE/"
  fi
  
  if [ -d "$TEMPLATE_PATH/.claude" ]; then
    cp -r "$TEMPLATE_PATH/.claude" "$BUILD_CONTEXT_TEMPLATE/"
  fi
  
  # Generate COPY commands - copy to /opt/sandagent/templates (won't be overwritten by volume)
  TEMPLATE_FILES="# Copy template files to /opt/sandagent/templates (volume-safe location)"
  TEMPLATE_FILES="$TEMPLATE_FILES\nRUN mkdir -p /opt/sandagent/templates"
  
  if [ -f "$BUILD_CONTEXT_TEMPLATE/CLAUDE.md" ]; then
    TEMPLATE_FILES="$TEMPLATE_FILES\nCOPY templates/$TEMPLATE/CLAUDE.md /opt/sandagent/templates/CLAUDE.md"
  fi
  
  if [ -d "$BUILD_CONTEXT_TEMPLATE/.claude" ]; then
    TEMPLATE_FILES="$TEMPLATE_FILES\nCOPY templates/$TEMPLATE/.claude /opt/sandagent/templates/.claude"
  fi
fi

# Replace placeholder in template
TEMP_FILE=$(mktemp)
while IFS= read -r line; do
  if [[ "$line" == *"{{TEMPLATE_FILES}}"* ]]; then
    if [ -n "$TEMPLATE_FILES" ]; then
      echo -e "$TEMPLATE_FILES"
    fi
  else
    echo "$line"
  fi
done < "$DOCKERFILE_TEMPLATE" > "$TEMP_FILE"

# If using build context, copy Dockerfile there too
if [ "$INCLUDE_TEMPLATE" = "true" ] && [ -n "$TEMPLATE" ]; then
  cp "$TEMP_FILE" ".build-context/Dockerfile"
  rm "$TEMP_FILE"
  echo "✅ Generated .build-context/Dockerfile"
else
  mv "$TEMP_FILE" "$OUTPUT_DOCKERFILE"
  echo "✅ Generated $OUTPUT_DOCKERFILE"
fi
