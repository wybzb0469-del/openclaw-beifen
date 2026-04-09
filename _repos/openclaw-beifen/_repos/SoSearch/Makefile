.PHONY: all build run docker-build docker-run docker-compose-up docker-compose-down clean

PORT ?= 11380

all: build

build:
	cargo build --release

run:
	PORT=$(PORT) cargo run --release

docker-build:
	docker build -t sosearch:latest .

docker-run:
	docker run -d -p $(PORT):$(PORT) -e PORT=$(PORT) --name sosearch-api sosearch:latest

docker-compose-up:
	PORT=$(PORT) docker compose up -d --build

docker-compose-down:
	docker compose down

clean:
	cargo clean
