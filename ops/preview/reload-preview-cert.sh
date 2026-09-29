#!/bin/sh
if systemctl is-active --quiet qianqi-preview; then
    systemctl reload qianqi-preview
fi
