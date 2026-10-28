# Solar Load Reader — Mark II

เว็บเครื่องมือช่วยอ่านโหลดไฟฟ้า / ประมาณขนาดระบบโซลาร์ และวิเคราะห์การเงินเบื้องต้น

## เปิดใช้งานยังไง

### วิธีง่ายสุด (บนเครื่องตัวเอง)
1. เปิดไฟล์ `index.html` ด้วยเบราว์เซอร์ (Chrome / Edge ก็ได้)
2. หรือลากไฟล์เข้าเบราว์เซอร์

### ผ่านเซิร์ฟเวอร์ท้องถิ่น (แนะนำตอนพัฒนา)
```bash
python3 serve.py
```
แล้วเปิด http://127.0.0.1:43127/

`serve.py` ส่ง `Cache-Control: no-store` เพื่อไม่ให้พรีวิวค้างไฟล์เก่า

### ผ่าน GitHub Pages
เมื่อเปิด Pages แล้ว จะมีลิงก์ประมาณ:
`https://somyod-creater.github.io/solar-load-reader-mark-ii/`

ไปเปิดที่: Settings → Pages → Deploy from a branch → `main` / `/ (root)`

## ใช้ทำอะไรได้บ้าง
- อ่าน/วิเคราะห์ข้อมูลโหลดที่เกี่ยวข้องกับระบบโซลาร์
- ดูกราฟ (ใช้ Plotly)
- ทำงานกับไฟล์ Excel (ใช้ SheetJS / xlsx)
- หน้า **Summary** หลังกด Run — เห็นตัวเลขหลักในหน้าเดียว
- **Export ข้อเสนอ** — เอกสาร 1 หน้าส่งลูกค้า (HTML + พิมพ์ PDF)
- **Wizard 3 ขั้น** บน Input Data — อัปโหลดโหลด → ตั้งค่าระบบ → Run
- **คำตัดสินแบต** จาก FusionSolar — บนกราฟ Load & Solar และ Summary
- ใส่ตัวอย่างบ้าน 1 เดือนได้จากปุ่มบน Input หรือเปิดด้วย `?demo=1`

## ไฟล์ตัวอย่างสำหรับทดสอบ
ดูโฟลเดอร์ [`sample-data/`](sample-data/) — มีโหลดบ้านเรือน 1 เดือน (`household_load_sep2026.xlsx` / `.csv`)

## โครงสร้างโปรเจกต์
- `index.html` — หน้าเว็บหลัก
- `styles.css` — สไตล์
- `app.js` — สคริปต์หลักของแอป
- `chart-theme.js` — ธีมกราฟ Plotly
- `serve.py` — เซิร์ฟเวอร์ท้องถิ่นแบบ no-cache
- `sample-data/` — ไฟล์โหลดตัวอย่าง
- `.gitignore` — ไม่ให้ไฟล์ชั่วคราว/Excel temp หลุดขึ้น GitHub

## License
ยังไม่ได้กำหนด — ใช้ส่วนตัว/ทดลอง
