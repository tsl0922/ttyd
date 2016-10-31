.PHONY: apt-update
apt-update:
	apt-get update

.PHONY: recommend
recommend: update
	apt-get install -y \
		telnet \
		python-dev \
		python-setuptools \
		python-pip \
		;

.PHONY: software-properties
oftware-properties: apt-update
	apt-get install -y software-properties-common python-software-properties
	make apt-update

.PHONY: golang
golang: software-properties
	add-apt-repository -y ppa:ubuntu-lxc/lxd-stable
	apt-get install -y golang

.PHONY: httpserver
httpserver: software-properties
	$(eval addr ?= "0:8080")
	python -m SimpleHTTPServer "$addr"
