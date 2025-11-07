import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import DocumentCanvas from '../components/DocumentCanvas'
import '../styles/Editor.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const Editor = () => {
  const { documentId } = useParams()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [document, setDocument] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchDocument()
  }, [documentId])

  const fetchDocument = async () => {
    try {
      setLoading(true)
      setError('')

      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/documents/${documentId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Document not found')
        }
        throw new Error('Failed to fetch document')
      }

      const data = await response.json()
      setDocument(data.document)
    } catch (err) {
      console.error('Error fetching document:', err)
      setError(err.message || 'Failed to load document')
    } finally {
      setLoading(false)
    }
  }

  const handleBackToDocuments = () => {
    navigate('/landing')
  }

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  if (loading) {
    return <div className="loading">Loading document...</div>
  }

  if (error) {
    return (
      <div className="editor-error-container">
        <div className="error-card">
          <h2>Error</h2>
          <p>{error}</p>
          <button onClick={handleBackToDocuments} className="btn btn-primary">
            Back to Documents
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="editor-container">
      <div className="editor-header">
        <div className="editor-header-left">
          <button onClick={handleBackToDocuments} className="btn-back">
            ← Back to Documents
          </button>
          <h1 className="document-title">{document?.name}</h1>
        </div>
        <div className="editor-header-right">
          {user && <span className="username">{user.firstName} {user.lastName}</span>}
          <button onClick={handleLogout} className="btn btn-logout-small">
            Logout
          </button>
        </div>
      </div>

      <div className="editor-content">
        {document && user && (
          <DocumentCanvas
            documentId={documentId}
            userId={user.id}
          />
        )}
      </div>
    </div>
  )
}

export default Editor
