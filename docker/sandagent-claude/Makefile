# Makefile for building and deploying sandagent-claude Docker image
# Supports both Daytona snapshots and E2B templates

# Load .env file if exists
-include .env
export

# Default configuration (unified image name)
# IMAGE_NAME can be overridden in .env; for "make image" we use BUILD_IMAGE_NAME so default is always vikadata/sandagent
IMAGE_NAME ?= vikadata/sandagent
BUILD_IMAGE_NAME ?= vikadata/sandagent
# Image tag: from .env IMAGE_TAG, or root package.json version (single source of truth)
MAKEFILE_DIR := $(shell dirname $(realpath $(firstword $(MAKEFILE_LIST))))
DEFAULT_IMAGE_TAG := $(shell cd "$(MAKEFILE_DIR)" && node -p "try{require('../../package.json').version}catch(e){'0.1.0'}")
IMAGE_TAG ?= $(DEFAULT_IMAGE_TAG)

# Template configuration (optional)
TEMPLATE ?=

# Full image name:
#   With template: vikadata/sandagent-researcher:0.1.0
#   Without template: vikadata/sandagent:0.1.0
FULL_IMAGE = $(if $(TEMPLATE),$(IMAGE_NAME)-$(TEMPLATE):$(IMAGE_TAG),$(IMAGE_NAME):$(IMAGE_TAG))

# Daytona snapshot name (same as image name)
DAYTONA_SNAPSHOT = $(FULL_IMAGE)

# E2B template alias (with template: vikadata/sandagent-researcher, without: vikadata/sandagent)
E2B_ALIAS = $(if $(TEMPLATE),$(IMAGE_NAME)-$(TEMPLATE),$(IMAGE_NAME))

# Resource configuration
CPU ?= 2
MEMORY ?= 4
DISK ?= 8

# Force mode (delete existing before create)
FORCE ?= false

.PHONY: help build daytona daytona-dockerfile e2b image image-local image-local-push image-push clean check-docker check-daytona install-daytona list

help:
	@echo "SandAgent Claude Docker Image Builder"
	@echo "======================================"
	@echo ""
	@echo "Usage: make <target> [OPTIONS]"
	@echo ""
	@echo "Targets:"
	@echo "  build              Build Docker image locally (Daytona/E2B naming)"
	@echo "  daytona            Deploy to Daytona (build + push)"
	@echo "  daytona-dockerfile Deploy to Daytona (use Dockerfile directly)"
	@echo "  e2b                Deploy to E2B"
	@echo "  image              Build Docker image (default: vikadata/sandagent:0.1.0)"
	@echo "  image-local        Build image from local monorepo (Dockerfile.local, no npm)"
	@echo "  image-local-push   Build image-local and push to Docker Hub"
	@echo "  image-push         Build and push image to Docker Hub"
	@echo "  list               List existing Daytona snapshots"
	@echo "  clean              Remove local Docker image"
	@echo "  check-docker       Verify Docker is running"
	@echo "  check-daytona      Check Daytona CLI version"
	@echo "  install-daytona    Install/upgrade Daytona CLI"
	@echo ""
	@echo "Options:"
	@echo "  IMAGE_TAG=x.y.z    Image version tag (default: $(IMAGE_TAG))"
	@echo "  NODE_IMAGE=img      Base image for image-local (default: $(NODE_IMAGE))"
	@echo "  TEMPLATE=name      Include template (e.g., researcher, coder, analyst)"
	@echo "  CPU=n              CPU cores (default: $(CPU))"
	@echo "  MEMORY=n           Memory in GB (default: $(MEMORY))"
	@echo "  DISK=n             Disk in GB (default: $(DISK))"
	@echo "  FORCE=true         Delete existing snapshot before creating"
	@echo ""
	@echo "Image Naming (IMAGE_NAME=$(IMAGE_NAME)):"
	@echo "  Without TEMPLATE:  $(IMAGE_NAME):$(IMAGE_TAG)"
	@echo "  With TEMPLATE:     $(IMAGE_NAME)-researcher:$(IMAGE_TAG)"
	@echo ""
	@echo "Examples:"
	@echo "  make daytona                           # → $(IMAGE_NAME):$(IMAGE_TAG)"
	@echo "  make daytona TEMPLATE=researcher       # → $(IMAGE_NAME)-researcher:$(IMAGE_TAG)"
	@echo "  make daytona TEMPLATE=coder            # → $(IMAGE_NAME)-coder:$(IMAGE_TAG)"
	@echo "  make daytona IMAGE_TAG=0.2.0           # → $(IMAGE_NAME):0.2.0"
	@echo "  make daytona TEMPLATE=analyst FORCE=true"
	@echo "  make e2b TEMPLATE=researcher CPU=4 MEMORY=8"
	@echo "  make image                      # build vikadata/sandagent:0.1.0 (uses BUILD_IMAGE_NAME)"
	@echo "  make image TEMPLATE=researcher  # build vikadata/sandagent-researcher:0.1.0"
	@echo "  make image-push                 # build + push to Docker Hub"
	@echo ""
	@echo "Environment (set in .env or export):"
	@echo "  DAYTONA_API_KEY    Required for Daytona deployment"
	@echo "  E2B_API_KEY        Required for E2B deployment"
	@echo "  IMAGE_TAG          Override image tag (default: root package.json version)"
	@echo "  BUILD_IMAGE_NAME   Image name for 'make image' (default: vikadata/sandagent)"

# Check Docker is running
check-docker:
	@docker info > /dev/null 2>&1 || (echo "❌ Docker is not running. Please start Docker first." && exit 1)
	@echo "✅ Docker is running"

# Check Daytona CLI
check-daytona:
	@which daytona > /dev/null 2>&1 || (echo "❌ Daytona CLI not found. Run: make install-daytona" && exit 1)
	@echo "Daytona CLI version:"
	@daytona version 2>/dev/null || echo "  (version check failed)"

# Install/upgrade Daytona CLI
install-daytona:
	@echo "Installing Daytona CLI..."
	@curl -sf -L https://download.daytona.io/daytona/install.sh | sudo bash
	@echo ""
	@echo "✅ Daytona CLI installed"
	@daytona version

# Build Docker image
build: check-docker
	@echo "Building Docker image: $(FULL_IMAGE)"
	@if [ -n "$(TEMPLATE)" ]; then \
		echo "  Including template: $(TEMPLATE)"; \
		./generate-dockerfile.sh $(TEMPLATE) ../../templates true; \
		docker build --platform=linux/amd64 -t $(FULL_IMAGE) -f .build-context/Dockerfile .build-context; \
	else \
		docker build --platform=linux/amd64 -t $(FULL_IMAGE) .; \
	fi
	@echo ""
	@echo "✅ Image built: $(FULL_IMAGE)"

# Deploy to Daytona using local image
daytona: check-docker check-daytona build
	@echo ""
	@echo "Deploying to Daytona..."
	@echo "  Snapshot: $(DAYTONA_SNAPSHOT)"
	@echo "  Image: $(FULL_IMAGE)"
	@echo "  Resources: $(CPU) CPU, $(MEMORY)GB RAM, $(DISK)GB disk"
	@echo ""
	@if [ -z "$$DAYTONA_API_KEY" ]; then \
		echo "❌ DAYTONA_API_KEY not set"; \
		echo "   Set in .env file or: export DAYTONA_API_KEY=dtn_***"; \
		exit 1; \
	fi; \
	daytona login --api-key "$$DAYTONA_API_KEY" >/dev/null 2>&1 || true; \
	FORCE_FLAG=""; \
	if [ "$(FORCE)" = "true" ]; then \
		FORCE_FLAG="--force"; \
	fi; \
	cd "$(shell dirname $(realpath $(firstword $(MAKEFILE_LIST))))" && \
	npx tsx build-daytona-snapshot.ts \
		--name "$(DAYTONA_SNAPSHOT)" \
		--image "$(FULL_IMAGE)" \
		--cpu $(CPU) \
		--memory $(MEMORY) \
		--disk $(DISK) \
		$$FORCE_FLAG

# Deploy to Daytona using Dockerfile directly (no local build)
daytona-dockerfile: check-daytona
	@echo ""
	@echo "Deploying to Daytona (from Dockerfile)..."
	@echo "  Snapshot: $(DAYTONA_SNAPSHOT)"
	@echo "  Resources: $(CPU) CPU, $(MEMORY)GB RAM, $(DISK)GB disk"
	@echo ""
	@if [ -z "$$DAYTONA_API_KEY" ]; then \
		echo "❌ DAYTONA_API_KEY not set"; \
		echo "   Set in .env file or: export DAYTONA_API_KEY=dtn_***"; \
		exit 1; \
	fi; \
	daytona login --api-key "$$DAYTONA_API_KEY" >/dev/null 2>&1 || true; \
	if [ -n "$(TEMPLATE)" ]; then \
		./generate-dockerfile.sh $(TEMPLATE); \
		daytona snapshot create $(DAYTONA_SNAPSHOT) \
			--dockerfile .build-context/Dockerfile \
			--cpu $(CPU) --memory $(MEMORY) --disk $(DISK); \
	else \
		daytona snapshot create $(DAYTONA_SNAPSHOT) \
			--dockerfile ./Dockerfile \
			--cpu $(CPU) --memory $(MEMORY) --disk $(DISK); \
	fi
	@echo ""
	@echo "✅ Snapshot created: $(DAYTONA_SNAPSHOT)"

# Deploy to E2B
e2b:
	@echo ""
	@echo "Deploying to E2B..."
	@echo "  Template: $(E2B_ALIAS)"
	@echo "  Resources: $(CPU) CPU, $(MEMORY)GB RAM"
	@echo "  Force: $(FORCE)"
	@echo ""
	@if [ -z "$$E2B_API_KEY" ]; then \
		echo "❌ E2B_API_KEY not set"; \
		echo "   Set in .env file or: export E2B_API_KEY=e2b_***"; \
		exit 1; \
	fi; \
	FORCE_FLAG=""; \
	if [ "$(FORCE)" = "true" ]; then \
		FORCE_FLAG="--force"; \
	fi; \
	cd "$(shell dirname $(realpath $(firstword $(MAKEFILE_LIST))))" && \
	if [ -n "$(TEMPLATE)" ]; then \
		echo "  Including template: $(TEMPLATE)"; \
		./generate-dockerfile.sh $(TEMPLATE) ../../templates true; \
		npx tsx build-e2b-template.ts \
			--alias "$(E2B_ALIAS)" \
			--cpu $(CPU) \
			--memory $$(( $(MEMORY) * 1024 )) \
			--context .build-context \
			$$FORCE_FLAG; \
	else \
		npx tsx build-e2b-template.ts \
			--alias "$(E2B_ALIAS)" \
			--cpu $(CPU) \
			--memory $$(( $(MEMORY) * 1024 )) \
			$$FORCE_FLAG; \
	fi

# Build Docker image (vikadata/sandagent, or vikadata/sandagent-TEMPLATE)
# Use BUILD_IMAGE_NAME so "make image" always uses vikadata/sandagent unless you pass BUILD_IMAGE_NAME=...
image: check-docker
	@echo "Building image..."
	@cd "$(shell dirname $(realpath $(firstword $(MAKEFILE_LIST))))" && \
		( [ -n "$(TEMPLATE)" ] && pnpm run image -- --name $(BUILD_IMAGE_NAME) --tag $(IMAGE_TAG) --template $(TEMPLATE) || pnpm run image -- --name $(BUILD_IMAGE_NAME) --tag $(IMAGE_TAG) )
	@echo "✅ Done. Image: $(BUILD_IMAGE_NAME)$(if $(TEMPLATE),-$(TEMPLATE),):$(IMAGE_TAG)"

# Build from local monorepo (runner-cli + runner-claude from repo, no npm publish)
# Context = repo root. Result: $(IMAGE_NAME):$(IMAGE_TAG) e.g. vikadata/sandagent:0.1.0
# NODE_IMAGE: base image for Dockerfile.local (default node:20-slim). Override if Docker Hub fails.
NODE_IMAGE ?= node:20-slim
REPO_ROOT := $(MAKEFILE_DIR)/../..
image-local: check-docker
	@echo "Building image from local repo (Dockerfile.local)..."
	@docker build --platform=linux/amd64 \
		--build-arg NODE_IMAGE="$(NODE_IMAGE)" \
		-f "$(MAKEFILE_DIR)/Dockerfile.local" -t "$(FULL_IMAGE)" "$(REPO_ROOT)"
	@echo "✅ Done. Image: $(FULL_IMAGE)"

image-local-push: image-local
	@echo "Pushing $(FULL_IMAGE)..."
	@docker push "$(FULL_IMAGE)"
	@echo "✅ Pushed."

# Build and push image to Docker Hub
image-push: check-docker
	@echo "Building and pushing image..."
	@cd "$(shell dirname $(realpath $(firstword $(MAKEFILE_LIST))))" && \
		( [ -n "$(TEMPLATE)" ] && pnpm run image -- --name $(BUILD_IMAGE_NAME) --tag $(IMAGE_TAG) --push --template $(TEMPLATE) || pnpm run image -- --name $(BUILD_IMAGE_NAME) --tag $(IMAGE_TAG) --push )
	@echo "✅ Done."

# List Daytona snapshots
list:
	@echo "Daytona Snapshots:"
	@echo "=================="
	@daytona snapshot list 2>/dev/null || echo "Failed to list snapshots. Check DAYTONA_API_KEY."

# Clean up
clean:
	@echo "Removing Docker image: $(FULL_IMAGE)"
	@docker rmi $(FULL_IMAGE) 2>/dev/null || echo "Image not found"
	@rm -rf .build-context
	@echo "✅ Cleaned up"
