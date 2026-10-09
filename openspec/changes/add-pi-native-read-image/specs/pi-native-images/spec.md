## ADDED Requirements

### Requirement: Native file-image reading
The Pi runner SHALL expose `read_image` with a required `file_path` string and
the display label `ReadImage`. It SHALL use Pi's native image processing and
resizing to return image content and explanatory text.

#### Scenario: Read an image in the working directory
- **WHEN** a vision-capable model invokes `read_image` with a valid image path
- **THEN** the result contains a native image block derived from the file
- **AND** the next model request contains the image content

#### Scenario: Invalid image input
- **WHEN** the path is missing, non-image, unsupported, or damaged
- **THEN** the tool returns an understandable error without a success image block

### Requirement: Declared model capability checks
The runner SHALL check the current model's `input` declaration before file-image
reading or prompting with uploaded images. Dynamically registered models SHALL
retain their existing image declaration without claiming remote verification.

#### Scenario: Text-only model reads an image
- **WHEN** a model without declared image input invokes `read_image`
- **THEN** the operation fails with a diagnostic suggesting existing OCR tools or a vision-capable model

#### Scenario: Text-only model receives an upload
- **WHEN** a prompt contains uploaded images and the selected model lacks declared image input
- **THEN** the runner rejects the image prompt explicitly rather than silently dropping images

### Requirement: Existing permission controls
The new tool SHALL participate in existing tool allowlists, approval,
cancellation, and text redaction. Explicit allowlists SHALL authorize
`read_image` by its own name.

#### Scenario: Read permission does not imply image-tool permission
- **WHEN** an explicit allowlist contains `read` but not `read_image`
- **THEN** the new tool is not available

#### Scenario: Approval is denied or execution is cancelled
- **WHEN** approval is denied or the operation is cancelled
- **THEN** image reading does not complete successfully

#### Scenario: Tool text is redacted
- **WHEN** a tool result contains text matching configured redaction rules
- **THEN** existing redaction applies to the text and preserves native image content

### Requirement: Uploaded and restored image compatibility
The runner SHALL preserve uploaded image labels and ordering and reuse Pi's
existing session persistence for image history.

#### Scenario: Multiple uploaded images
- **WHEN** a vision-capable model receives multiple labeled uploaded images
- **THEN** their labels and image ordering are retained in the prompt

#### Scenario: Restored image history
- **WHEN** a session containing native images is restored
- **THEN** subsequent model requests retain the history's image content through Pi persistence

### Requirement: OCR extension compatibility
The change SHALL preserve existing Pi `read`, bash/MCP OCR extensions,
AskUserQuestion, and other runners without adding an OCR backend or automatic
OCR fallback.

#### Scenario: Existing OCR extension remains usable
- **WHEN** bash or MCP OCR is configured and authorized
- **THEN** existing registration and invocation remain available independently of `read_image`

### Requirement: Distinguish transport and live vision proof
Verification SHALL distinguish local image transport tests from actual visual
understanding, and SHALL report unavailable live-model or OCR coverage.

#### Scenario: Local protocol server verifies transport
- **WHEN** built CLI, daemon, and SDK flows run against a local protocol server
- **THEN** verification checks actual outgoing image bytes without claiming visual understanding

#### Scenario: Real vision model verifies file and upload paths
- **WHEN** opt-in live tests have credentials and a vision-capable model
- **THEN** both file and upload cases identify random text and visual color/shape features
