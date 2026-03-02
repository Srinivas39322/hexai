const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function uploadSession(file: File, athleteId: string) {
    const formData = new FormData()
    formData.append('video', file)
    formData.append('athlete_id', athleteId)
    const res = await fetch(`${API_URL}/sessions/upload`, {
        method: 'POST',
        body: formData,
    })
    return res.json()
}

export async function getSession(sessionId: string) {
    const res = await fetch(`${API_URL}/sessions/${sessionId}`)
    return res.json()
}

export async function getDashboard(athleteId: string) {
    const res = await fetch(`${API_URL}/athletes/${athleteId}/dashboard`)
    return res.json()
}

export async function checkHealth() {
    const res = await fetch(`${API_URL}/health`)
    return res.json()
}