# LinkedIn AutoConnect Pro — Chrome Extension

## 🚀 Installation Guide (Hindi me)

### Step 1: Chrome me Extensions page kholo
1. Chrome browser kholo.
2. URL bar me type karo: `chrome://extensions/`
3. Enter dabao.

### Step 2: Developer Mode ON karo
1. Page ke **upar right corner** me ek toggle dikhega: **"Developer mode"**
2. Use **ON** karo (blue ho jayega).

### Step 3: Extension Load karo
1. **"Load unpacked"** button dikhega — uspar click karo.
2. File explorer me jaake `linkedin-extension` folder select karo.
3. **"Select Folder"** dabao.

### Step 4: Extension Ready!
1. Chrome ke upar right corner me ek naya **LinkedIn icon** aa jayega.
2. Uspar click karo — Extension ka UI khul jayega.

---

## 📋 Use Kaise Karein?

### A. URLs Paste Karo
1. Extension ke **"Queue"** tab me LinkedIn profile URLs paste karo (ek line me ek URL).
2. URLs `GSSoC_All_Data_Complete.xlsx` file ke "LinkedIn URL" column se copy kar sakte hain.

### B. Action Choose Karo
- **Follow Only** — Bas follow karega.
- **Connect (No Note)** — Connection request bhejega bina message ke.
- **Connect + Note** — Connection request ke sath ek message bhi bhejega.

### C. Start Dabao
- **Start** — Automation shuru hoga.
- **Pause** — Temporarily rok sakte hain.
- **Stop** — Band kar do aur queue clear karo.

---

## ⚙️ Safety Settings

- **Daily Limit**: Default 25 per day (LinkedIn ki safe limit ke andar).
- **Delay**: Har profile ke beech 40 second wait (adjustable 20s-90s).
- **Random Jitter**: ±15 second random variation taaki pattern na bane.

---

## ⚠️ Important Safety Notes

1. **LinkedIn me pehle se LOGIN hona zaroori hai!** Extension aapke logged-in session ko use karta hai.
2. **Daily Limit 25-30 se zyada BILKUL mat karo** — isse LinkedIn account restrict ho sakta hai.
3. **Raat ko mat chalao** — Din ke time chalao jab normally LinkedIn use karte hain.
4. **Ek din me ek baar hi chalao** — Baar-baar start/stop mat karo.

---

## 📂 Files Structure
```
linkedin-extension/
├── manifest.json      (Extension config — Manifest V3)
├── popup.html         (UI Window)
├── popup.css          (Dark theme styling)
├── popup.js           (UI logic & queue management)
├── background.js      (Service Worker — tab & alarm management)
├── content.js         (LinkedIn page interaction & button clicking)
└── icons/             (Extension icons)
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```
