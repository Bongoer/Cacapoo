FROM debian:stable-slim

RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    bash ca-certificates coreutils curl file iproute2 iputils-ping less nano procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /root
CMD ["/bin/bash"]
