package com.tvtimerevived.updatenotification

import androidx.core.content.FileProvider

/** Own FileProvider subclass: two providers with the same class would clash in the merged manifest */
class UpdateFileProvider : FileProvider()
