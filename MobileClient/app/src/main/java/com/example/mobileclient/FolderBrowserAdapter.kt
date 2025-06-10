import android.os.Environment
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.example.mobileclient.Folder
import com.example.mobileclient.R
import java.io.File

// FolderBrowserAdapter.kt - Adapter dla folderów z serwera

class FolderBrowserAdapter(
    private val folders: List<Folder>,
    private val onFolderSelected: (Folder) -> Unit
) : RecyclerView.Adapter<FolderBrowserAdapter.ViewHolder>() {

    class ViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val ivIcon: ImageView = itemView.findViewById(R.id.ivIcon)
        val tvName: TextView = itemView.findViewById(R.id.tvName)
        val tvDescription: TextView = itemView.findViewById(R.id.tvDescription)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_folder_browser, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val folder = folders[position]

        holder.ivIcon.setImageResource(R.drawable.ic_folder)
        holder.tvName.text = folder.name
        holder.tvDescription.text = folder.description ?: ""
        holder.tvDescription.visibility = if (folder.description.isNullOrEmpty()) View.GONE else View.VISIBLE

        holder.itemView.setOnClickListener {
            onFolderSelected(folder)
        }
    }

    override fun getItemCount() = folders.size
}

// LocalFolderBrowserAdapter.kt - Adapter dla lokalnych folderów

class LocalFolderBrowserAdapter(
    private val directories: List<File>,
    private val currentPath: String,
    private val rootPath: String,
    private val onFolderSelected: (String) -> Unit,
    private val onCreateFolder: (String) -> Unit
) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    companion object {
        private const val TYPE_PARENT = 0
        private const val TYPE_FOLDER = 1
        private const val TYPE_NAVIGATION = 2
    }

    private val showParent = File(currentPath).parent != null
    private val showQuickNav = currentPath != Environment.getExternalStorageDirectory()?.absolutePath

    override fun getItemViewType(position: Int): Int {
        return when {
            showParent && position == 0 -> TYPE_PARENT
            showQuickNav && position == (if (showParent) 1 else 0) -> TYPE_NAVIGATION
            else -> TYPE_FOLDER
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        return when (viewType) {
            TYPE_PARENT -> {
                val view = LayoutInflater.from(parent.context)
                    .inflate(R.layout.item_folder_parent, parent, false)
                ParentViewHolder(view)
            }
            TYPE_NAVIGATION -> {
                val view = LayoutInflater.from(parent.context)
                    .inflate(R.layout.item_folder_navigation, parent, false)
                NavigationViewHolder(view)
            }
            else -> {
                val view = LayoutInflater.from(parent.context)
                    .inflate(R.layout.item_folder_browser, parent, false)
                FolderViewHolder(view)
            }
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        when (holder) {
            is ParentViewHolder -> {
                holder.ivIcon.setImageResource(R.drawable.ic_folder_up)
                holder.tvName.text = "⬆️ Folder nadrzędny"
                holder.itemView.setOnClickListener {
                    val parentPath = File(currentPath).parent
                    if (parentPath != null) {
                        onFolderSelected(parentPath)
                    }
                }
            }
            is NavigationViewHolder -> {
                holder.tvPath.text = "📱 Przejdź do głównego katalogu"
                holder.itemView.setOnClickListener {
                    Environment.getExternalStorageDirectory()?.let {
                        onFolderSelected(it.absolutePath)
                    }
                }
            }
            is FolderViewHolder -> {
                val adjustedPosition = position - getHeaderCount()

                if (adjustedPosition >= 0 && adjustedPosition < directories.size) {
                    val directory = directories[adjustedPosition]

                    holder.ivIcon.setImageResource(R.drawable.ic_folder)
                    holder.tvName.text = directory.name

                    // Pokaż informacje o folderze
                    val tvDescription = holder.itemView.findViewById<TextView>(R.id.tvDescription)
                    tvDescription?.let {
                        val itemCount = try {
                            directory.listFiles()?.size ?: 0
                        } catch (e: SecurityException) {
                            -1
                        }

                        it.text = when {
                            itemCount < 0 -> "Brak dostępu"
                            itemCount == 0 -> "Pusty folder"
                            else -> "$itemCount elementów"
                        }
                        it.visibility = View.VISIBLE
                    }

                    holder.itemView.setOnClickListener {
                        onFolderSelected(directory.absolutePath)
                    }
                }
            }
        }
    }

    private fun getHeaderCount(): Int {
        var count = 0
        if (showParent) count++
        if (showQuickNav) count++
        return count
    }

    override fun getItemCount(): Int {
        return directories.size + getHeaderCount()
    }

    class ParentViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val ivIcon: ImageView = itemView.findViewById(R.id.ivIcon)
        val tvName: TextView = itemView.findViewById(R.id.tvName)
    }

    class NavigationViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val tvPath: TextView = itemView.findViewById(R.id.tvPath)
    }

    class FolderViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val ivIcon: ImageView = itemView.findViewById(R.id.ivIcon)
        val tvName: TextView = itemView.findViewById(R.id.tvName)
    }
}