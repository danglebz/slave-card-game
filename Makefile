# Makefile — เกมไพ่สลาฟ (สั้น ๆ ครอบ workflow ที่ใช้บ่อย)
# ใช้ pnpm เป็นตัวจัดการแพ็กเกจ (ดู packageManager ใน package.json)

PNPM := pnpm

.DEFAULT_GOAL := help
.PHONY: help install dev dev-server build preview start \
        lint lint-fix format format-check typecheck \
        test test-watch test-unit test-integration test-smoke test-e2e \
        coverage commitlint check check-all clean

help: ## แสดงคำสั่งที่มีทั้งหมด
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: ## ติดตั้ง dependencies
	$(PNPM) install

dev: ## รัน Vite dev server (client)
	$(PNPM) dev

dev-server: ## รัน Express + Socket.IO (server, โหมด watch)
	$(PNPM) dev:server

build: ## build client ออกไป dist/
	$(PNPM) build

preview: ## พรีวิว build
	$(PNPM) preview

start: ## รัน production server
	$(PNPM) start

lint: ## ตรวจ ESLint
	$(PNPM) lint

lint-fix: ## ตรวจ + แก้ ESLint อัตโนมัติ
	$(PNPM) lint:fix

format: ## จัดรูปแบบโค้ดด้วย Prettier
	$(PNPM) format

format-check: ## เช็คว่า format ถูกต้องไหม (ไม่แก้ไฟล์)
	$(PNPM) format:check

typecheck: ## ตรวจชนิดด้วย tsc (ผ่าน JSDoc ฝั่ง server)
	$(PNPM) typecheck

test: ## รันเทส Vitest ทั้งหมด (unit + integration + smoke)
	$(PNPM) test

test-watch: ## รันเทสแบบ watch
	$(PNPM) test:watch

test-unit: ## รันเฉพาะ unit test (ตรรกะ pure)
	$(PNPM) test:unit

test-integration: ## รันเฉพาะ integration test (Room + game)
	$(PNPM) test:integration

test-smoke: ## รันเฉพาะ smoke test (boot server จริง)
	$(PNPM) test:smoke

test-e2e: ## รัน e2e ด้วย Playwright (build + serve + browser)
	$(PNPM) test:e2e

coverage: ## รันเทสพร้อมรายงาน coverage
	$(PNPM) coverage

commitlint: ## เช็คข้อความ commit ล่าสุดว่าตรง Conventional Commits
	$(PNPM) exec commitlint --from HEAD~1 --to HEAD

check: lint format-check typecheck test ## ตรวจครบ (lint+format+type+vitest) — ใช้ก่อน commit/CI

check-all: check test-e2e ## เหมือน check แต่รวม e2e ด้วย (ช้ากว่า)

clean: ## ลบ build output และไฟล์ชั่วคราว
	rm -rf dist node_modules/.vite tmp
