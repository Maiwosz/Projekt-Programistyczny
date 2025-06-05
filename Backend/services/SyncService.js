const mongoose = require('mongoose');
const User = require('../models/User');
const Folder = require('../models/Folder');
const File = require('../models/File');
const Client = require('../models/Client');
const SyncFolder = require('../models/SyncFolder');
const { generateFileHash, getCategoryFromMimeType } = require('../utils/fileUtils');
const path = require('path');
const fs = require('fs');
class SyncService {
    
    // === ZARZĄDZANIE KLIENTAMI ===
    
    async registerClient(userId, clientData) {
        const { clientId, type, name, metadata = {} } = clientData;
        
        if (!clientId || !type || !name) {
            throw new Error('clientId, type i name są wymagane');
        }
        
        // Sprawdź czy klient już istnieje
        let client = await Client.findOne({ user: userId, clientId });
        
        if (client) {
            // Aktualizuj istniejącego klienta
            client.name = name;
            client.type = type;
            client.metadata = metadata;
            client.lastSeen = new Date();
            client.isActive = true;
            await client.save();
        } else {
            // Utwórz nowego klienta
            client = new Client({
                user: userId,
                clientId,
                type,
                name,
                metadata
            });
            await client.save();
        }
        
        return client;
    }
    
    async getUserClients(userId, filters = {}) {
		const query = { user: userId };
		
		if (filters.type) {
			query.type = filters.type;
		}
		
		if (filters.active !== undefined) {
			query.isActive = filters.active === 'true';
		}
		
		const clients = await Client.find(query).sort({ lastSeen: -1 });
		
		// *** DODAJ GOOGLE DRIVE JEŚLI JEST POŁĄCZONY ***
		const GoogleDriveClient = require('../models/GoogleDriveClient');
		const driveClient = await GoogleDriveClient.findOne({ 
			user: userId,
			'status.isConnected': true 
		});
		
		if (driveClient) {
			// Sprawdź czy już nie ma klienta Google Drive w Client
			const existingGoogleClient = clients.find(c => c.clientId === 'google-drive');
			
			if (!existingGoogleClient) {
				// Utwórz tymczasowy obiekt klienta Google Drive
				const googleClient = {
					_id: 'google-drive-temp',
					clientId: 'google-drive',
					type: 'server-integration',
					name: driveClient.name || 'Google Drive',
					isActive: true,
					lastSeen: driveClient.status.lastSync || driveClient.updatedAt,
					createdAt: driveClient.createdAt,
					updatedAt: driveClient.updatedAt,
					metadata: {
						googleDriveClientId: driveClient._id,
						googleUser: driveClient.googleUser
					}
				};
				clients.push(googleClient);
			}
		}
		
		return clients;
	}
    
    async deactivateClient(userId, clientId) {
        const client = await Client.findOne({ user: userId, clientId });
        if (!client) {
            throw new Error('Klient nie znaleziony');
        }
        
        client.isActive = false;
        await client.save();
        
        return { success: true, message: 'Klient został dezaktywowany' };
    }
    
    async updateClientActivity(userId, clientId) {
        const client = await Client.findOne({ user: userId, clientId });
        if (!client) {
            throw new Error('Klient nie znaleziony');
        }
        
        client.lastSeen = new Date();
        await client.save();
        
        return client;
    }
    
    // === ZARZĄDZANIE SYNCHRONIZACJĄ FOLDERÓW ===
    
    async createSyncFolder(userId, folderId, clients) {
		try {
			// Sprawdź czy folder istnieje
			const folder = await Folder.findById(folderId);
			if (!folder) {
				throw new Error('Folder nie został znaleziony');
			}

			// Sprawdź czy synchronizacja już istnieje
			let syncFolder = await SyncFolder.findOne({
				user: userId,
				folder: folderId
			});

			if (syncFolder) {
				// Aktualizuj istniejącą synchronizację
				for (const newClientConfig of clients) {
					// Znajdź klienta po clientId
					const client = await Client.findOne({ 
						user: userId, 
						clientId: newClientConfig.clientId 
					});
					
					if (!client) {
						throw new Error(`Klient o ID ${newClientConfig.clientId} nie został znaleziony`);
					}

					// Sprawdź czy klient już istnieje w synchronizacji
					const existingClientIndex = syncFolder.clients.findIndex(
						clientConfig => clientConfig.client.toString() === client._id.toString()
					);

					const clientConfigToSave = {
						client: client._id,
						clientId: newClientConfig.clientId,
						clientFolderId: newClientConfig.clientFolderId,
						clientFolderName: newClientConfig.clientFolderName,
						clientFolderPath: newClientConfig.clientFolderPath,
						syncDirection: newClientConfig.syncDirection || 'bidirectional',
						filters: newClientConfig.filters || {},
						isActive: newClientConfig.isActive !== undefined ? newClientConfig.isActive : true,
						lastSyncDate: newClientConfig.lastSyncDate
					};

					if (existingClientIndex >= 0) {
						// Aktualizuj istniejący klient
						syncFolder.clients[existingClientIndex] = {
							...syncFolder.clients[existingClientIndex].toObject(),
							...clientConfigToSave
						};
					} else {
						// Dodaj nowy klient
						syncFolder.clients.push(clientConfigToSave);
					}
				}
			} else {
				// Utwórz nową synchronizację
				const clientConfigs = [];
				
				for (const clientConfig of clients) {
					// Znajdź klienta po clientId
					const client = await Client.findOne({ 
						user: userId, 
						clientId: clientConfig.clientId 
					});
					
					if (!client) {
						throw new Error(`Klient o ID ${clientConfig.clientId} nie został znaleziony`);
					}

					clientConfigs.push({
						client: client._id,
						clientId: clientConfig.clientId,
						clientFolderId: clientConfig.clientFolderId,
						clientFolderName: clientConfig.clientFolderName,
						clientFolderPath: clientConfig.clientFolderPath,
						syncDirection: clientConfig.syncDirection || 'bidirectional',
						filters: clientConfig.filters || {},
						isActive: clientConfig.isActive !== undefined ? clientConfig.isActive : true,
						lastSyncDate: clientConfig.lastSyncDate
					});
				}

				syncFolder = new SyncFolder({
					user: userId,
					folder: folderId,
					clients: clientConfigs
				});
			}

			await syncFolder.save();
			return syncFolder;

		} catch (error) {
			console.error('Błąd tworzenia SyncFolder:', error);
			throw error;
		}
	}
    
    async getSyncFolders(userId, filters = {}) {
		const query = { user: userId };
		
		if (filters.clientId) {
			const client = await Client.findOne({ user: userId, clientId: filters.clientId });
			if (client) {
				query['clients.client'] = client._id;
			} else {
				return []; // Klient nie znaleziony
			}
		}
		
		// Poprawione filtrowanie po folderId - konwertuj string na ObjectId
		if (filters.folderId) {
			if (mongoose.Types.ObjectId.isValid(filters.folderId)) {
				query.folder = filters.folderId;
			} else {
				return []; // Nieprawidłowy ObjectId
			}
		}
		
		return await SyncFolder.find(query)
			.populate('folder', 'name description')
			.populate('clients.client', 'clientId name type isActive lastSeen metadata');
	}
    
    async removeSyncFolder(userId, folderId, clientId = null) {
		const syncFolder = await SyncFolder.findOne({ user: userId, folder: folderId });
		if (!syncFolder) {
			throw new Error('Zsynchronizowany folder nie znaleziony');
		}
		
		if (clientId) {
			// Usuń tylko konkretnego klienta
			const client = await Client.findOne({ user: userId, clientId });
			if (client) {
				syncFolder.clients = syncFolder.clients.filter(
					c => c.client.toString() !== client._id.toString()
				);
				
				if (syncFolder.clients.length === 0) {
					await SyncFolder.findByIdAndDelete(syncFolder._id);
				} else {
					await syncFolder.save();
				}
			}
		} else {
			// Usuń całą synchronizację folderu
			await SyncFolder.findByIdAndDelete(syncFolder._id);
		}
		
		return { success: true, message: 'Synchronizacja folderu została usunięta' };
	}
    
    // === OPERACJE NA PLIKACH ===
    
    async getFilesForSync(userId, folderId, clientId, options = {}) {
        const client = await Client.findOne({ user: userId, clientId });
        if (!client) {
            throw new Error('Klient nie znaleziony');
        }
        
        const query = {
            user: userId,
            folder: folderId,
            isDeleted: false
        };
        
        // Filtry czasowe
        if (options.modifiedSince) {
            query.lastModified = { $gte: new Date(options.modifiedSince) };
        }
        
        // Filtr dla niezsynchronizowanych plików
        if (options.notSynced === 'true') {
            query.$or = [
                { clientMappings: { $size: 0 } },
                { clientMappings: { $not: { $elemMatch: { client: client._id } } } }
            ];
        }
        
        const files = await File.find(query).lean();
        
        // Zastosuj filtry z konfiguracji synchronizacji
        const syncFolder = await SyncFolder.findOne({ 
            user: userId, 
            folder: folderId,
            'clients.client': client._id 
        });
        
        if (syncFolder) {
            const clientConfig = syncFolder.clients.find(
                c => c.client.toString() === client._id.toString()
            );
            
            if (clientConfig && clientConfig.filters) {
                return this.applyFileFilters(files, clientConfig.filters);
            }
        }
        
        return files;
    }
    
    async syncFileFromClient(userId, clientId, fileData) {
        const {
            folderId,
            clientFileId,
            clientFileName,
            clientPath,
            name,
            mimetype,
            size,
            lastModified,
            content,
            hash,
            action = 'create' // 'create', 'update', 'delete'
        } = fileData;
        
        if (!folderId || !clientFileId) {
            throw new Error('folderId i clientFileId są wymagane');
        }
        
        const client = await Client.findOne({ user: userId, clientId });
        if (!client) {
            throw new Error('Klient nie znaleziony');
        }
        
        const folder = await Folder.findOne({ _id: folderId, user: userId });
        if (!folder) {
            throw new Error('Folder nie znaleziony');
        }
        
        if (action === 'delete') {
            return await this.handleFileDeleteFromClient(userId, client._id, clientFileId, clientPath);
        }
        
        // Reszta logiki dla create/update pozostaje bez zmian...
        // (kod istniejący)
        
        if (!name) {
            throw new Error('name jest wymagane dla operacji create/update');
        }
        
        let existingFile = await File.findOne({
            user: userId,
            folder: folderId,
            'clientMappings.client': client._id,
            'clientMappings.clientFileId': clientFileId,
            isDeleted: false
        });
        
        if (!existingFile) {
            existingFile = await File.findOne({
                user: userId,
                folder: folderId,
                originalName: name,
                isDeleted: false
            });
        }
        
        const category = getCategoryFromMimeType(mimetype);
        let filePath = null;
        let fileHash = hash;
        
        if (content) {
            const uploadDir = path.resolve(process.env.UPLOADS_DIR, category);
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            
            const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(name);
            filePath = path.join(uploadDir, uniqueName);
            
            try {
                const buffer = Buffer.from(content, 'base64');
                fs.writeFileSync(filePath, buffer);
                
                if (!fileHash) {
                    fileHash = await generateFileHash(filePath);
                }
            } catch (error) {
                throw new Error('Błąd zapisywania pliku: ' + error.message);
            }
        }
        
        const clientMapping = {
            client: client._id,
            clientFileId,
            clientFileName: clientFileName || name,
            clientPath: clientPath || '',
            lastSyncDate: new Date()
        };
        
        if (existingFile) {
            if (filePath) {
                const oldFilePath = path.resolve(process.env.UPLOADS_DIR, existingFile.path);
                if (fs.existsSync(oldFilePath)) {
                    try {
                        fs.unlinkSync(oldFilePath);
                    } catch (error) {
                        console.warn('Nie można usunąć starego pliku:', error.message);
                    }
                }
                existingFile.path = path.join(category, path.basename(filePath)).replace(/\\/g, '/');
            }
            
            existingFile.originalName = name;
            existingFile.mimetype = mimetype;
            existingFile.size = size;
            existingFile.fileHash = fileHash;
            existingFile.lastModified = new Date(lastModified);
            
            const mappingIndex = existingFile.clientMappings.findIndex(
                m => m.client.toString() === client._id.toString() && m.clientPath === clientPath
            );
            
            if (mappingIndex >= 0) {
                existingFile.clientMappings[mappingIndex] = {
                    ...existingFile.clientMappings[mappingIndex].toObject(),
                    ...clientMapping
                };
            } else {
                existingFile.clientMappings.push(clientMapping);
            }
            
            await existingFile.save();
            return existingFile;
        } else {
            const file = new File({
                user: userId,
                path: filePath ? path.join(category, path.basename(filePath)).replace(/\\/g, '/') : null,
                originalName: name,
                mimetype: mimetype,
                size: size,
                category: category,
                folder: folderId,
                fileHash: fileHash,
                lastModified: new Date(lastModified),
                clientMappings: [clientMapping]
            });
            
            await file.save();
            return file;
        }
    }
	
	async handleFileDeleteFromClient(userId, clientId, clientFileId, clientPath = '') {
        try {
            const file = await File.findOne({
                user: userId,
                'clientMappings.client': clientId,
                'clientMappings.clientFileId': clientFileId,
                'clientMappings.clientPath': clientPath,
                isDeleted: false
            });
            
            if (!file) {
                console.log(`Plik do usunięcia nie znaleziony: clientFileId=${clientFileId}, clientPath=${clientPath}`);
                return { success: true, message: 'Plik już nie istnieje', found: false };
            }
            
            console.log(`Otrzymano żądanie usunięcia pliku: ${file.originalName}`);
            
            // Usuń mapowanie do tego klienta
            const initialMappingsCount = file.clientMappings.length;
            file.clientMappings = file.clientMappings.filter(
                m => !(m.client.toString() === clientId.toString() && 
                       m.clientFileId === clientFileId &&
                       m.clientPath === clientPath)
            );
            
            // Jeśli to było ostatnie mapowanie, oznacz plik jako usunięty
            if (file.clientMappings.length === 0) {
                file.isDeleted = true;
                file.deletedAt = new Date();
                
                // Usuń fizyczny plik z dysku
                const fullPath = path.resolve(process.env.UPLOADS_DIR, file.path);
                if (fs.existsSync(fullPath)) {
                    try {
                        fs.unlinkSync(fullPath);
                        console.log(`Usunięto fizyczny plik: ${fullPath}`);
                    } catch (error) {
                        console.warn(`Nie można usunąć fizycznego pliku ${fullPath}:`, error.message);
                    }
                }
            }
            
            await file.save();
            
            // Uruchom synchronizację z innymi klientami (propagacja usunięcia)
            if (initialMappingsCount > file.clientMappings.length) {
                await this.propagateFileDeletion(userId, file);
            }
            
            return { 
                success: true, 
                message: file.isDeleted ? 'Plik został całkowicie usunięty' : 'Mapowanie klienta zostało usunięte',
                file,
                fullyDeleted: file.isDeleted
            };
            
        } catch (error) {
            console.error('Błąd usuwania pliku od klienta:', error);
            throw error;
        }
    }
	
	async propagateFileDeletion(userId, file) {
        try {
            console.log(`Propagacja usunięcia pliku ${file.originalName} do innych klientów`);
            
            const syncFolder = await SyncFolder.findOne({ 
                user: userId, 
                folder: file.folder 
            }).populate('clients.client');
            
            if (!syncFolder) {
                console.log('Brak konfiguracji synchronizacji dla tego folderu');
                return;
            }
            
            // Sprawdź czy folder ma skonfigurowany Google Drive
            const googleDriveClientConfig = syncFolder.clients.find(c => c.clientId === 'google-drive');
            
            if (googleDriveClientConfig && googleDriveClientConfig.isActive) {
                // Znajdź mapowanie Google Drive dla tego pliku
                const driveMapping = file.clientMappings.find(
                    m => m.clientPath === googleDriveClientConfig.clientFolderId
                );
                
                if (driveMapping) {
                    console.log(`Usuwam plik ${file.originalName} z Google Drive`);
                    
                    try {
                        const GoogleDriveService = require('./GoogleDriveService');
                        await GoogleDriveService.deleteFile(userId, driveMapping.clientFileId);
                        
                        // Usuń mapowanie Google Drive z pliku
                        file.clientMappings = file.clientMappings.filter(
                            m => m.clientFileId !== driveMapping.clientFileId
                        );
                        
                        // Jeśli to było ostatnie mapowanie, oznacz jako usunięty
                        if (file.clientMappings.length === 0) {
                            file.isDeleted = true;
                            file.deletedAt = new Date();
                        }
                        
                        await file.save();
                        
                        console.log(`Plik ${file.originalName} usunięty z Google Drive`);
                    } catch (error) {
                        console.error(`Błąd usuwania pliku z Google Drive:`, error);
                    }
                }
            }
            
        } catch (error) {
            console.error('Błąd propagacji usunięcia pliku:', error);
        }
    }
	
	async deleteFilesInFolder(userId, folderId, clientId = null) {
        try {
            const query = {
                user: userId,
                folder: folderId,
                isDeleted: false
            };
            
            // Jeśli podano clientId, usuń tylko pliki tego klienta
            if (clientId) {
                const client = await Client.findOne({ user: userId, clientId });
                if (client) {
                    query['clientMappings.client'] = client._id;
                }
            }
            
            const files = await File.find(query);
            let deletedCount = 0;
            
            for (const file of files) {
                if (clientId) {
                    // Usuń tylko mapowanie tego klienta
                    const client = await Client.findOne({ user: userId, clientId });
                    await this.handleFileDeleteFromClient(userId, client._id, 
                        file.clientMappings.find(m => m.client.toString() === client._id.toString())?.clientFileId,
                        file.clientMappings.find(m => m.client.toString() === client._id.toString())?.clientPath
                    );
                } else {
                    // Usuń cały plik
                    file.isDeleted = true;
                    file.deletedAt = new Date();
                    file.clientMappings = [];
                    
                    // Usuń fizyczny plik
                    const fullPath = path.resolve(process.env.UPLOADS_DIR, file.path);
                    if (fs.existsSync(fullPath)) {
                        try {
                            fs.unlinkSync(fullPath);
                        } catch (error) {
                            console.warn(`Nie można usunąć fizycznego pliku ${fullPath}:`, error.message);
                        }
                    }
                    
                    await file.save();
                }
                deletedCount++;
            }
            
            return { success: true, deletedCount, message: `Usunięto ${deletedCount} plików` };
            
        } catch (error) {
            console.error('Błąd usuwania plików z folderu:', error);
            throw error;
        }
    }
    
    async handleFileDelete(userId, clientId, clientFileId) {
        const file = await File.findOne({
            user: userId,
            'clientMappings.client': clientId,
            'clientMappings.clientFileId': clientFileId,
            isDeleted: false
        });
        
        if (!file) {
            throw new Error('Plik nie znaleziony');
        }
        
        file.isDeleted = true;
        file.deletedAt = new Date();
        
        await file.save();
        return { success: true, message: 'Plik został oznaczony jako usunięty', file };
    }
    
    // === UTILITY METHODS ===
    
    applyFileFilters(files, filters) {
        if (!filters) return files;
        
        return files.filter(file => {
            const ext = path.extname(file.originalName).toLowerCase();
            
            // Sprawdź rozszerzenia (priorytet dla excludedExtensions)
            if (filters.excludedExtensions && filters.excludedExtensions.length > 0) {
                if (filters.excludedExtensions.includes(ext)) {
                    return false;
                }
            } else if (filters.allowedExtensions && filters.allowedExtensions.length > 0) {
                if (!filters.allowedExtensions.includes(ext)) {
                    return false;
                }
            }
            
            // Sprawdź rozmiar pliku
            if (file.size && filters.maxFileSize && file.size > filters.maxFileSize) {
                return false;
            }
            
            return true;
        });
    }
    
    async needsSync(localFile, clientFile, clientId) {
        if (!localFile && !clientFile) {
            return false;
        }
        
        // Nowy plik u klienta
        if (!localFile && clientFile) {
            return { direction: 'from-client', file: clientFile, reason: 'new-on-client' };
        }
        
        // Nowy plik lokalny
        if (localFile && !clientFile) {
            return { direction: 'to-client', file: localFile, reason: 'new-on-server' };
        }
        
        // Sprawdź czy plik ma mapowanie dla tego klienta
        const clientMapping = localFile.clientMappings?.find(
            m => m.client.toString() === clientId.toString()
        );
        
        if (!clientMapping) {
            return { direction: 'to-client', file: localFile, reason: 'not-synced-to-client' };
        }
        
        // Porównaj daty modyfikacji - "newest wins"
        const localModified = new Date(localFile.lastModified || localFile.createdAt);
        const clientModified = new Date(clientFile.lastModified);
        
        if (clientModified > localModified) {
            return { direction: 'from-client', file: clientFile, reason: 'client-newer' };
        } else if (localModified > clientModified) {
            return { direction: 'to-client', file: localFile, reason: 'server-newer' };
        }
        
        // Porównaj hash jeśli dostępny
        if (localFile.fileHash && clientFile.hash && localFile.fileHash !== clientFile.hash) {
            // W przypadku różnych hashów ale takiej samej daty - konflikt
            return { 
                direction: 'conflict', 
                localFile, 
                clientFile, 
                reason: 'hash-mismatch-same-date' 
            };
        }
        
        return false; // Brak potrzeby synchronizacji
    }
    
    // === POMOCNICZE METODY DLA KONTROLERÓW ===
    
    async markFolderForSync(userId, folderId) {
        const syncFolder = await SyncFolder.findOne({ user: userId, folder: folderId });
        if (syncFolder) {
            syncFolder.updatedAt = new Date();
            await syncFolder.save();
            
            // Uruchom automatyczną synchronizację Google Drive (włącznie z usuwaniem)
            await this.triggerGoogleDriveAutoSync(userId, folderId);
            
            return true;
        }
        return false;
    }
    
    async isFolderSynced(userId, folderId) {
        const syncFolder = await SyncFolder.findOne({ 
            user: userId, 
            folder: folderId,
            'clients.isActive': true
        });
        return !!syncFolder;
    }
	
	// Metody Google Drive
	async triggerGoogleDriveAutoSync(userId, folderId) {
		try {
			// Import Google Drive Service (dodaj na górze pliku jeśli nie ma)
			const GoogleDriveService = require('./GoogleDriveService');
			
			// Sprawdź czy użytkownik ma skonfigurowany Google Drive
			const isConfigured = await GoogleDriveService.isGoogleDriveConfigured(userId);
			
			if (!isConfigured) {
				console.log(`Google Drive nie jest skonfigurowany dla użytkownika ${userId}`);
				return;
			}
			
			console.log(`Uruchamianie automatycznej synchronizacji Google Drive dla folderu ${folderId}`);
			
			// Uruchom synchronizację w tle (bez czekania na zakończenie)
			setImmediate(async () => {
				try {
					const result = await GoogleDriveService.autoSyncFolder(userId, folderId);
					if (result.success) {
						console.log('Automatyczna synchronizacja Google Drive zakończona pomyślnie');
					} else if (result.skipped) {
						console.log(`Synchronizacja Google Drive pominięta: ${result.reason}`);
					} else {
						console.error('Błąd automatycznej synchronizacji Google Drive:', result.error);
					}
				} catch (error) {
					console.error('Nieoczekiwany błąd podczas automatycznej synchronizacji:', error);
				}
			});
			
		} catch (error) {
			console.error('Błąd podczas uruchamiania automatycznej synchronizacji Google Drive:', error);
		}
	}

	// Dodaj metodę do ręcznego uruchamiania synchronizacji Google Drive
	async manualGoogleDriveSync(userId, folderId, googleDriveFolderId = null) {
		const GoogleDriveService = require('./GoogleDriveService');
		
		const isConfigured = await GoogleDriveService.isGoogleDriveConfigured(userId);
		if (!isConfigured) {
			throw new Error('Google Drive nie jest skonfigurowany lub wyłączony');
		}
		
		return await GoogleDriveService.autoSyncFolder(userId, folderId, googleDriveFolderId);
	}
	
	async ensureGoogleDriveClient(userId) {
		const GoogleDriveClient = require('../models/GoogleDriveClient');
		
		// Sprawdź czy GoogleDriveClient istnieje i jest połączony
		const driveClient = await GoogleDriveClient.findOne({ 
			user: userId,
			'status.isConnected': true 
		});
		
		if (!driveClient) {
			return null;
		}
		
		// Sprawdź czy istnieje odpowiedni rekord w Client
		let client = await Client.findOne({ 
			user: userId, 
			clientId: 'google-drive',
			type: 'server-integration'
		});
		
		if (!client) {
			// Utwórz nowy rekord Client dla Google Drive
			client = new Client({
				user: userId,
				clientId: 'google-drive',
				type: 'server-integration',
				name: driveClient.name || 'Google Drive',
				metadata: {
					googleDriveClientId: driveClient._id,
					googleUser: driveClient.googleUser
				}
			});
			await client.save();
		} else {
			// Aktualizuj istniejący rekord
			client.name = driveClient.name || 'Google Drive';
			client.metadata = {
				googleDriveClientId: driveClient._id,
				googleUser: driveClient.googleUser
			};
			client.isActive = true;
			client.lastSeen = new Date();
			await client.save();
		}
		
		return client;
	}
}

module.exports = new SyncService();