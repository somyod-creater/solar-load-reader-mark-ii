# Solar Load Reader — Mark II

เว็บเครื่องมือช่วยอ่านโหลดไฟฟ้า / ประมาณขนาดระบบโซลาร์ และวิเคราะห์การเงินเบื้องต้น

## เปิดใช้งานยังไง

### วิธีง่ายสุด (บนเครื่องตัวเอง)
1. เปิดไฟล์ `index.html` ด้วยเบราว์เซอร์ (Chrome / Edge ก็ได้)
2. หรือลากไฟล์เข้าเบราว์เซอร์

### ผ่าน GitHub Pages
เมื่อเปิด Pages แล้ว จะมีลิงก์ประมาณ:
`https://somyod-creater.github.io/solar-load-reader-mark-ii/`

ไปเปิดที่: Settings → Pages → Deploy from a branch → `main` / `/ (root)`

## ใช้ทำอะไรได้บ้าง
- อ่าน/วิเคราะห์ข้อมูลโหลดที่เกี่ยวข้องกับระบบโซลาร์
- ดูกราฟ (ใช้ Plotly)
- ทำงานกับไฟล์ Excel (ใช้ SheetJS / xlsx)

## โครงสร้างโปรเจกต์
- `index.html` — หน้าเว็บหลัก
- `styles.css` — สไตล์
- `app.js` — สคริปต์หลักของแอป
- `.gitignore` — ไม่ให้ไฟล์ชั่วคราว/Excel temp หลุดขึ้น GitHub

## License
ยังไม่ได้กำหนด — ใช้ส่วนตัว/ทดลอง
