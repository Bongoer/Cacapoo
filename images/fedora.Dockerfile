FROM fedora:latest

RUN dnf -y install \
    bash ca-certificates coreutils curl file findutils iproute iputils less nano procps-ng \
    && dnf clean all

WORKDIR /root
CMD ["/bin/bash"]
