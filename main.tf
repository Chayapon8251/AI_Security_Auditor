# 1. กำหนด Provider
provider "google" {
  project = var.project_id
  region  = var.region
}

# 2. เปิดใช้งาน APIs ที่จำเป็น
resource "google_project_service" "services" {
  for_each = toset([
    "run.googleapis.com",      # สำหรับรัน Backend
    "aiplatform.googleapis.com", # สำหรับ Gemini (Vertex AI)
    "iam.googleapis.com"
  ])
  service = each.key
  disable_on_destroy = false
}

# 3. สร้าง Cloud Run Service (ตัวอย่างสำหรับ Backend)
resource "google_cloud_run_v2_service" "backend" {
  name     = "security-auditor-api"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    containers {
      image = "gcr.io/${var.project_id}/security-auditor-backend:latest" # Path ไปยัง Artifact Registry
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
  }
  depends_on = [google_project_service.services]
}

# 4. ตั้งค่าให้ Public เข้าถึงได้ (สำหรับ Demo)
resource "google_cloud_run_v2_service_iam_member" "public_access" {
  name     = google_cloud_run_v2_service.backend.name
  location = google_cloud_run_v2_service.backend.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}