variable "project_id" {
  description = "GCP Project ID ของคุณ"
  type        = string
}

variable "region" {
  default = "us-central1" # Gemini Live API มักจะอัปเดตที่โซนนี้ก่อน
}