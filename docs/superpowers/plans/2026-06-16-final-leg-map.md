# Final Leg Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the tracking map so it shows only the current sender position, the recipient position, and one solid line for the final leg.

**Architecture:** Extract the map point selection into a focused helper that decides the current and destination coordinates from tracking data. Update the Leaflet renderer to stop generating intermediate route segments and draw a single direct polyline only.

**Tech Stack:** Vanilla JavaScript ES modules, Node built-in test runner, Leaflet

---
