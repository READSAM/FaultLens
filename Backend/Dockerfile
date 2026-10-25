# Use a stable Ubuntu base image
FROM ubuntu:22.04

# Prevent interactive prompts during apt installations
ENV DEBIAN_FRONTEND=noninteractive

# Install compilers, interpreters, and build tools for all languages
RUN apt-get update && apt-get install -y \
    # C/C++ Compilers & Build Tools
    build-essential \
    cmake \
    clang \
    # Java Development Kit & Build Tools (JDK replaces JRE so you can compile Java)
    openjdk-11-jdk \
    maven \
    gradle \
    # Python Interpreter & Package Manager
    python3 \
    python3-pip \
    # C# / .NET 6 SDK
    dotnet6 \
    # General utilities often needed by build scripts
    git \
    wget \
    unzip \
    libncurses5 \
    libtinfo5 \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory for installation
WORKDIR /opt

# Copy the SourceMeter .tgz archive
COPY  SourceMeter-10.2.0-x64-Linux.tgz /opt/sourcemeter.tar.gz

# Extract the tarball, rename, and clean up
RUN tar -xzf sourcemeter.tar.gz && \
    rm sourcemeter.tar.gz && \
    mv SourceMeter-* SourceMeter

# Expose all languages (CPP, Java, Python, CSharp) to the system PATH
ENV PATH="/opt/SourceMeter/CPP:/opt/SourceMeter/Java:/opt/SourceMeter/Python:/opt/SourceMeter/CSharp:${PATH}"

# Set the working directory for execution
WORKDIR /code