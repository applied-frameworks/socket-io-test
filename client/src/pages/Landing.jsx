import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const Landing = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newDocumentName, setNewDocumentName] = useState('')
  const [creatingDocument, setCreatingDocument] = useState(false)

  // Fetch documents on mount
  useEffect(() => {
    fetchDocuments()
  }, [])

  const fetchDocuments = async () => {
    try {
      setLoading(true)
      setError('')

      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/documents`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch documents')
      }

      const data = await response.json()
      setDocuments(data.documents)
    } catch (err) {
      console.error('Error fetching documents:', err)
      setError('Failed to load documents')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateDocument = async (e) => {
    e.preventDefault()
    if (!newDocumentName.trim()) return

    try {
      setCreatingDocument(true)
      setError('')

      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: newDocumentName.trim() })
      })

      if (!response.ok) {
        throw new Error('Failed to create document')
      }

      const data = await response.json()

      // Close modal and reset
      setShowCreateModal(false)
      setNewDocumentName('')

      // Refresh documents list
      await fetchDocuments()

      // Navigate to the new document editor
      navigate(`/editor/${data.document.id}`)
    } catch (err) {
      console.error('Error creating document:', err)
      setError('Failed to create document')
    } finally {
      setCreatingDocument(false)
    }
  }

  const handleDeleteDocument = async (documentId, documentName) => {
    if (!window.confirm(`Are you sure you want to delete "${documentName}"? This action cannot be undone.`)) {
      return
    }

    try {
      setError('')
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/documents/${documentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to delete document')
      }

      // Refresh documents list
      await fetchDocuments()
    } catch (err) {
      console.error('Error deleting document:', err)
      setError('Failed to delete document')
    }
  }

  const handleEditDocument = (documentId) => {
    navigate(`/editor/${documentId}`)
  }

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="landing-container">
      <div className="landing-header-bar">
        <div className="user-info">
          {user && <span className="username">{user.firstName} {user.lastName}</span>}
          <button onClick={handleLogout} className="btn btn-logout-small">
            Logout
          </button>
        </div>
      </div>

      <div className="landing-content">
        <div className="documents-header">
          <h1>My Documents</h1>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
          >
            + New Document
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        {loading ? (
          <div className="loading">Loading documents...</div>
        ) : documents.length === 0 ? (
          <div className="empty-state">
            <p>No documents yet. Create your first document to get started!</p>
          </div>
        ) : (
          <div className="documents-list">
            {documents.map((doc) => (
              <div key={doc.id} className="document-card">
                <div className="document-info">
                  <h3 className="document-name">{doc.name}</h3>
                  <p className="document-meta">
                    Last modified: {formatDate(doc.lastModified)}
                  </p>
                </div>
                <div className="document-actions">
                  <button
                    onClick={() => handleEditDocument(doc.id)}
                    className="btn btn-edit"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteDocument(doc.id, doc.name)}
                    className="btn btn-delete"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Document Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Create New Document</h2>
            <form onSubmit={handleCreateDocument}>
              <div className="form-group">
                <label htmlFor="documentName">Document Name</label>
                <input
                  type="text"
                  id="documentName"
                  value={newDocumentName}
                  onChange={(e) => setNewDocumentName(e.target.value)}
                  placeholder="Enter document name"
                  autoFocus
                  required
                  maxLength={100}
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-secondary"
                  disabled={creatingDocument}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={creatingDocument || !newDocumentName.trim()}
                >
                  {creatingDocument ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Landing
