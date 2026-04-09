FROM ghcr.io/cross-rs/aarch64-unknown-linux-gnu:main

# boring-sys2 (BoringSSL) cross-compilation requires:
# - cmake: for the BoringSSL build system
# - clang/llvm/libclang-dev: for bindgen to parse C headers
# - perl: for BoringSSL configuration scripts
# - g++-aarch64-linux-gnu: arm64 C++ cross-compiler (already in base image)
RUN apt-get update && apt-get install -y \
    cmake \
    clang \
    llvm \
    libclang-dev \
    perl \
    make \
    && rm -rf /var/lib/apt/lists/*
